import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma, SettlementBatch } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  istanbulDateKey,
  offerDateToDbDate,
} from "../../common/utils/istanbul-date.util";
import { addBusinessDays } from "./business-days";
import { computeSettlement, SettlementInputLine } from "./settlement-math";
import { PublicHolidayService } from "./public-holiday.service";
import { PricingService } from "./pricing.service";
import { MembershipOffsetService } from "../memberships/membership-offset.service";
import { RECOMPUTABLE_SETTLEMENT_STATUSES } from "./settlement-transitions";

const PAYOUT_DUE_BUSINESS_DAYS = 5;

interface ClawbackCandidate {
  reservationId: string;
  /** Already-recovered cumulative amount for this line (SettlementLine.
   * clawbackCents as it stood before this pass) — [Fix round, I4] this
   * column is genuinely cumulative now, not write-once. */
  priorClawbackCents: number;
  /** The line's full theoretical demand: grossCents - bagFeeCents -
   * bagFeeVatCents - withholdingCents, floored at 0. */
  fullDemandCents: number;
  /** fullDemandCents - priorClawbackCents, floored at 0 — what's still
   * outstanding for THIS line specifically. */
  remainingCents: number;
}

/**
 * The core "build/recompute a settlement batch" engine — the meaty half of
 * the batch lifecycle (brief §3's nightly cron + the clawback sweep).
 * settlements.service.ts (admin/merchant-facing CRUD) and
 * settlement-payout.service.ts (payout execution) both call
 * `recomputeBatch` too — approve() recomputes once more before locking a
 * batch in, matching the class doc comment on idempotent recompute.
 *
 * RECOMPUTE, NOT INCREMENT: every batch mutation this class performs is a
 * full re-derivation from the batch's CURRENT children (its settlement
 * lines' stored grossCents + the reservation's qty, the merchant's
 * CURRENT bag-fee config, the membership subscription's CURRENT
 * outstanding balance, and any still-unclaimed refund clawback) — never
 * an incremental delta. Combined with the row locks below (`FOR UPDATE`
 * on the batch, the membership subscription, the specific clawback-
 * candidate lines, and — once resolved — the merchant's predecessor
 * batch), this is what makes two concurrent nightly runs safe: whichever
 * transaction gets there first serializes the other, which then re-reads
 * the now-current state and re-derives — never double-applies.
 *
 * [Fix round] `runNightlyCycle` is now actually scheduled — the original
 * ship left it callable but undecorated (a real bug: deployed, this
 * engine would never have run on its own; see `runNightlyCycleCron`).
 */
@Injectable()
export class SettlementBatchBuilderService {
  private readonly logger = new Logger(SettlementBatchBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: PublicHolidayService,
    private readonly pricing: PricingService,
    private readonly membershipOffset: MembershipOffsetService,
  ) {}

  /** [Fix round, C1] 02:00 Europe/Istanbul, daily — before the membership
   * renewal cron (03:00) and the reconciliation alert (09:00), so a
   * night's redemptions are batched before anything else that day depends
   * on them. There is also an on-demand admin trigger (POST /api/admin/
   * settlements/run-nightly — settlements.service.ts.adminRunNightlyCycle)
   * for ops to run this without waiting for the schedule. */
  @Cron("0 2 * * *", {
    name: "settlement-nightly-batch",
    timeZone: "Europe/Istanbul",
  })
  async runNightlyCycleCron(): Promise<void> {
    const result = await this.runNightlyCycle(new Date());
    if (result.batchIds.length > 0) {
      this.logger.log(
        `Nightly settlement batch: touched ${result.batchIds.length} batch(es)`,
      );
    }
  }

  /** Not private — realdb specs (and the admin trigger endpoint) call
   * this directly (once, or concurrently from two harness instances)
   * instead of waiting on the cron schedule. Returns every batch id
   * touched this run. */
  async runNightlyCycle(now: Date): Promise<{ batchIds: string[] }> {
    const touched = new Set<string>();

    const eligible = await this.prisma.reservation.findMany({
      where: {
        status: "REDEEMED",
        redeemedAt: { not: null },
        settlementLine: null,
        payment: { status: "PAID" },
      },
      // Oldest redemption first — this is what makes a merchant with
      // several eligible days queued up (a catch-up after downtime, or a
      // test seeding multiple days at once) process those days in
      // chronological order within ONE runNightlyCycle call: each day's
      // group is recomputed (and, for membership, offsets applied)
      // strictly before the next, so a subscription's outstandingCents
      // rolls forward day-by-day rather than in an unspecified order.
      orderBy: { redeemedAt: "asc" },
      select: {
        id: true,
        redeemedAt: true,
        totalCents: true,
        qty: true,
        store: { select: { merchantId: true } },
      },
    });

    type Group = {
      merchantId: string;
      dayKey: string;
      lines: SettlementInputLine[];
      redeemedAtByReservation: Map<string, Date>;
    };
    const groups = new Map<string, Group>();
    for (const r of eligible) {
      const merchantId = r.store.merchantId;
      const dayKey = istanbulDateKey(r.redeemedAt!);
      const groupKey = `${merchantId}:${dayKey}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          merchantId,
          dayKey,
          lines: [],
          redeemedAtByReservation: new Map(),
        };
        groups.set(groupKey, group);
      }
      group.lines.push({
        reservationId: r.id,
        grossCents: r.totalCents,
        qty: r.qty,
      });
      group.redeemedAtByReservation.set(r.id, r.redeemedAt!);
    }

    const merchantsWithFreshLines = new Set<string>();
    for (const group of groups.values()) {
      merchantsWithFreshLines.add(group.merchantId);
      const batchId = await this.createOrExtendBatch(
        group.merchantId,
        group.dayKey,
        group.lines,
        group.redeemedAtByReservation,
      );
      await this.recomputeBatch(batchId, now);
      touched.add(batchId);
    }

    // Clawback-only sweep: merchants with an unclaimed refund clawback but
    // NO fresh lines this cycle (a merchant WITH fresh lines already had
    // its clawback opportunistically absorbed by recomputeBatch above —
    // it queries pending clawback unconditionally, not just for the
    // clawback-only path).
    const clawbackMerchantIds = await this.findMerchantsWithPendingClawback();
    const todayKey = istanbulDateKey(now);
    for (const merchantId of clawbackMerchantIds) {
      if (merchantsWithFreshLines.has(merchantId)) continue;
      const batchId = await this.createOrExtendBatch(
        merchantId,
        todayKey,
        [],
        new Map(),
      );
      await this.recomputeBatch(batchId, now);
      touched.add(batchId);
    }

    return { batchIds: Array.from(touched) };
  }

  private async findMerchantsWithPendingClawback(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ merchantId: string }[]>(
      Prisma.sql`
        SELECT DISTINCT sb."merchantId" AS "merchantId"
        FROM "settlement_lines" sl
        JOIN "settlement_batches" sb ON sb.id = sl."batchId"
        JOIN "payments" p ON p."reservationId" = sl."reservationId"
        WHERE sl."clawbackAppliedAt" IS NULL
          AND sb."status" IN ('SENT', 'SETTLED')
          AND (sl."grossCents" - sl."bagFeeCents" - sl."bagFeeVatCents" - sl."withholdingCents" - sl."clawbackCents") > 0
          AND EXISTS (
            SELECT 1 FROM "refunds" rf
            WHERE rf."paymentId" = p.id AND rf."status" IN ('DONE', 'SENT')
          )
      `,
    );
    return rows.map((r) => r.merchantId);
  }

  /**
   * Find-or-create the batch for (merchantId, the Istanbul calendar day
   * `dayKey`), bulk-insert `lines` as new SettlementLine rows with
   * `skipDuplicates: true` — the actual mechanism that makes "each
   * reservation lands in exactly one line" true under concurrency: two
   * concurrent callers racing the SAME candidate reservation both attempt
   * the insert, Postgres's unique index on reservationId lets only one
   * succeed, `skipDuplicates` means the loser's whole batch statement does
   * not abort over it. Per-line bagFee/VAT/withholding for the NEW rows is
   * computed via a throwaway computeSettlement() call (its aggregate is
   * discarded — recomputeBatch, called right after by every caller, is the
   * authoritative aggregate over ALL the batch's lines, old and new).
   *
   * [Fix round, minor] Matches CALCULATED **or HELD** — a HELD batch can
   * legitimately receive new lines (a very-late redemption for a day whose
   * batch already went HELD) rather than always spawning a second batch
   * for the same merchant+day; safe now that C2's fix makes recomputing an
   * already-HELD batch correctly consume its own carried shortfall instead
   * of losing it.
   *
   * BATCH CREATION is protected by a Postgres transaction-scoped advisory
   * lock keyed on (merchantId, dayKey) — NOT a partial unique index
   * (schema.prisma / Prisma's migration diffing has no portable way to
   * express "unique WHERE status IN (...)" without hand-rolling a SECOND
   * permanent divergence between schema.prisma and the migrations folder,
   * on top of the one already accepted for stores.location's GIST index —
   * not worth doubling that CI-tolerance surface for what an advisory lock
   * already solves cleanly). `pg_advisory_xact_lock` blocks a concurrently-
   * racing transaction until this one commits (or rolls back), auto-
   * releasing at transaction end — no separate unlock call, no risk of a
   * stuck lock from a crashed process. `hashtext(...)` turns the
   * (merchantId, dayKey) string key into the bigint key
   * pg_advisory_xact_lock requires.
   */
  private async createOrExtendBatch(
    merchantId: string,
    dayKey: string,
    lines: SettlementInputLine[],
    redeemedAtByReservation: Map<string, Date>,
  ): Promise<string> {
    const periodStart = offerDateToDbDate(dayKey);
    const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
    const lockKey = `settlement-batch:${merchantId}:${dayKey}`;

    const batchId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      let batch = await tx.settlementBatch.findFirst({
        where: {
          merchantId,
          periodStart,
          status: { in: [...RECOMPUTABLE_SETTLEMENT_STATUSES] },
        },
      });
      if (!batch) {
        const holidaySet = await this.holidays.getHolidayDateKeys();
        const dueAt = addBusinessDays(
          periodStart,
          PAYOUT_DUE_BUSINESS_DAYS,
          holidaySet,
        );
        batch = await tx.settlementBatch.create({
          data: {
            merchantId,
            periodStart,
            periodEnd,
            status: "CALCULATED",
            dueAt,
          },
        });
      }
      return batch.id;
    });

    if (lines.length > 0) {
      const bagFeeCents = await this.pricing.resolveBagFeeCentsForMerchant(
        this.prisma,
        await this.prisma.merchant.findUniqueOrThrow({
          where: { id: merchantId },
          select: { bagFeeCentsOverride: true },
        }),
        periodStart,
      );
      const { perLine } = computeSettlement({
        lines,
        bagFeeCents,
        membershipDueCents: 0,
        priorClawbackCents: 0,
      });

      await this.prisma.settlementLine.createMany({
        data: perLine.map((pl) => ({
          batchId,
          reservationId: pl.reservationId,
          redeemedAt: redeemedAtByReservation.get(pl.reservationId)!,
          grossCents: pl.grossCents,
          bagFeeCents: pl.bagFeeCents,
          bagFeeVatCents: pl.bagFeeVatCents,
          withholdingCents: pl.withholdingCents,
        })),
        skipDuplicates: true,
      });
    }

    return batchId;
  }

  /**
   * Recompute a batch's stored totals from scratch — the single write
   * path every batch mutation funnels through (brand-new lines just
   * inserted, a later "extend" adding more, approve()'s pre-lock
   * recompute, and the clawback sweep). No-ops (returns the batch as-is)
   * once a batch has left {CALCULATED, HELD} (RECOMPUTABLE_SETTLEMENT_
   * STATUSES) — APPROVED/SENT/SETTLED/FAILED are frozen; APPROVED is
   * included in the frozen set deliberately (approve() itself is the LAST
   * recompute a batch ever gets, performed immediately before flipping to
   * APPROVED in the same transaction — see settlements.service.ts). [Fix
   * round, C3] ALSO refuses (defense in depth — settlements.service.ts's
   * adminHold already refuses to move a batch with `payoutAttemptedAt` set
   * OUT of APPROVED in the first place, so this should be unreachable, but
   * a future code path reaching recomputeBatch on such a batch must still
   * never touch its now-frozen amount) once `payoutAttemptedAt` is set.
   */
  async recomputeBatch(batchId: string, now: Date): Promise<SettlementBatch> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<SettlementBatch[]>(Prisma.sql`
        SELECT * FROM "settlement_batches" WHERE "id" = ${batchId} FOR UPDATE
      `);
      const batch = locked[0];
      if (!batch) {
        throw new Error(`recomputeBatch: batch ${batchId} not found`);
      }
      if (
        !RECOMPUTABLE_SETTLEMENT_STATUSES.includes(batch.status) ||
        batch.payoutAttemptedAt !== null
      ) {
        return batch;
      }

      const merchant = await tx.merchant.findUniqueOrThrow({
        where: { id: batch.merchantId },
        select: { bagFeeCentsOverride: true, membershipExemptUntil: true },
      });
      const bagFeeCents = await this.pricing.resolveBagFeeCentsForMerchant(
        tx,
        merchant,
        batch.periodStart,
      );

      const lineRows = await tx.settlementLine.findMany({
        where: { batchId },
        select: {
          reservationId: true,
          grossCents: true,
          reservation: { select: { qty: true } },
        },
      });
      const lines: SettlementInputLine[] = lineRows.map((l) => ({
        reservationId: l.reservationId,
        grossCents: l.grossCents,
        qty: l.reservation.qty,
      }));

      const due = await this.membershipOffset.lockAndResolveDue(
        tx,
        batch.merchantId,
        batch.membershipOffsetCents,
        batch.membershipOffsetVatCents,
        batch.periodStart,
        merchant.membershipExemptUntil,
      );
      const membershipDueCents = due?.dueCents ?? 0;

      const clawback = await this.lockPendingClawback(tx, batch.merchantId);

      // [Fix round, C2] Cross-batch shortfall inheritance happens EXACTLY
      // ONCE per batch, on its first-ever recompute pass — every later
      // pass (an admin retry on a HELD batch, or an "extend" adding new
      // lines to one) consumes the batch's OWN currently-stored
      // `carriedExternalDemandCents` instead of re-querying a sibling.
      //
      // `carriedExternalDemandCents` is DELIBERATELY a separate column
      // from `carriedShortfallCents` (the batch's TOTAL unmet demand,
      // which also bakes in this batch's own fixed-fees-exceed-gross
      // deficit — computeSettlement re-derives THAT fresh from `lines`
      // every single pass, no help needed). Feeding the FULL
      // carriedShortfallCents back in as `priorClawbackCents` on a later
      // pass would double-count the own-fee-deficit component — verified
      // empirically while deriving this fix's own test numbers: it made a
      // batch's reported shortfall GROW on every retry (2000 -> 4000 ->
      // 6000 -> ...) with zero new information, instead of converging.
      // `carriedExternalDemandCents` sidesteps this entirely by never
      // mixing the two: it starts from `resolveCarriedShortfall`'s
      // cross-batch lookup on the first pass, and on every pass after
      // that is updated to "how much of it survived THIS pass's
      // absorption" (see the clawback-allocation block below) —
      // completely decoupled from whatever `lines` does.
      const isFirstPass = batch.shortfallResolvedAt === null;
      const carriedFromPrior = isFirstPass
        ? await this.resolveCarriedShortfall(tx, batch.merchantId, batchId)
        : batch.carriedExternalDemandCents;

      const priorClawbackCents = clawback.totalCents + carriedFromPrior;

      const result = computeSettlement({
        lines,
        bagFeeCents,
        membershipDueCents,
        priorClawbackCents,
      });

      let membershipOffsetVatCents = 0;
      if (due) {
        const offsetResult = await this.membershipOffset.persistOffset(
          tx,
          due,
          membershipDueCents,
          due.dueVatCents,
          result.membershipOffsetCents,
        );
        membershipOffsetVatCents = offsetResult.appliedOffsetVatCents;
      }

      // [Fix round, C2] The carried-external demand is absorbed FIRST
      // (oldest debt), ahead of any freshly-detected per-line clawback —
      // see the allocation block below, which relies on this same
      // "absorb-external-first" split for `remainingToAllocate`. Whatever
      // of `carriedFromPrior` is NOT absorbed this pass is exactly what
      // `carriedExternalDemandCents` carries into the NEXT pass.
      const externalAbsorbedThisPass = Math.min(
        carriedFromPrior,
        result.refundClawbackCents,
      );
      const newCarriedExternalDemandCents =
        carriedFromPrior - externalAbsorbedThisPass;

      const updated = await tx.settlementBatch.update({
        where: { id: batchId },
        data: {
          grossCents: result.grossCents,
          bagFeeCents: result.bagFeeCents,
          bagFeeVatCents: result.bagFeeVatCents,
          withholdingCents: result.withholdingCents,
          membershipOffsetCents: result.membershipOffsetCents,
          membershipOffsetVatCents,
          refundClawbackCents: result.refundClawbackCents,
          netPayoutCents: result.netPayoutCents,
          carriedShortfallCents: result.carriedShortfallCents,
          carriedExternalDemandCents: newCarriedExternalDemandCents,
          shortfallResolvedAt: batch.shortfallResolvedAt ?? now,
          status: result.held ? "HELD" : "CALCULATED",
          holdReason: result.held
            ? `Otomatik: net bakiye negatif, ${result.carriedShortfallCents} kuruş sonraki döneme taşındı`
            : null,
        },
      });

      for (const pl of result.perLine) {
        await tx.settlementLine.update({
          where: { reservationId: pl.reservationId },
          data: {
            bagFeeCents: pl.bagFeeCents,
            bagFeeVatCents: pl.bagFeeVatCents,
            withholdingCents: pl.withholdingCents,
          },
        });
      }

      // [Fix round, I4] Allocate result.refundClawbackCents in priority
      // order: the inherited (non-line-attributable) carried external
      // demand first — older debt, `externalAbsorbedThisPass` above —
      // then fresh per-line demand, oldest reservation first
      // (lockPendingClawback's ORDER BY redeemedAt ASC). Each candidate's
      // clawbackCents is now a CUMULATIVE running total (a line can be
      // topped up across several batches); clawbackAppliedAt is only
      // stamped once a line's cumulative recovery reaches its full
      // theoretical demand — a partially-absorbed line stays eligible for
      // the NEXT sweep instead of being incorrectly marked fully resolved.
      let remainingToAllocate =
        result.refundClawbackCents - externalAbsorbedThisPass;
      for (const candidate of clawback.candidates) {
        if (remainingToAllocate <= 0) break;
        const absorbed = Math.min(
          remainingToAllocate,
          candidate.remainingCents,
        );
        if (absorbed <= 0) continue;
        remainingToAllocate -= absorbed;
        const newCumulative = candidate.priorClawbackCents + absorbed;
        const fullyResolved = newCumulative >= candidate.fullDemandCents;
        await tx.settlementLine.update({
          where: { reservationId: candidate.reservationId },
          data: {
            clawbackCents: newCumulative,
            clawbackBatchId: batchId,
            ...(fullyResolved ? { clawbackAppliedAt: now } : {}),
          },
        });
      }

      return updated;
    });
  }

  /**
   * Locks (FOR UPDATE OF sl) every settlement_line with an outstanding
   * refund clawback for this merchant, BEFORE this transaction's
   * computeSettlement() call uses their sum. Without this lock, two
   * concurrent recomputeBatch calls for the same merchant (a fresh
   * today's batch and, say, an older still-open one, processed by two
   * overlapping cron ticks) could both read the SAME unclaimed clawback
   * total, both bake it into their own batch's aggregate, and only
   * discover the conflict at the final line update — by which point one
   * batch's ALREADY-COMMITTED totals would be wrong (double-counted
   * clawback), even though the underlying lines were only ever claimed
   * once. Locking here means the second transaction BLOCKS until the
   * first commits, then re-reads and correctly sees these rows' updated
   * (possibly now-fully-resolved) clawbackCents.
   *
   * [Fix round, I4] `clawbackCents` is a CUMULATIVE running total per line
   * now (see the class doc comment) — `remainingCents` (this line's full
   * demand minus what's already been recovered across any prior batches)
   * is what's actually available to allocate this pass, not the line's
   * full original demand. A line only appears here at all while
   * `remainingCents > 0` (the WHERE clause on `clawbackAppliedAt IS NULL`
   * covers the same condition from the other direction — appliedAt is
   * only ever stamped once remainingCents hits exactly 0).
   */
  private async lockPendingClawback(
    tx: Prisma.TransactionClient,
    merchantId: string,
  ): Promise<{ totalCents: number; candidates: ClawbackCandidate[] }> {
    const rows = await tx.$queryRaw<
      {
        reservationId: string;
        grossCents: number;
        bagFeeCents: number;
        bagFeeVatCents: number;
        withholdingCents: number;
        clawbackCents: number;
      }[]
    >(Prisma.sql`
      SELECT sl."reservationId", sl."grossCents", sl."bagFeeCents", sl."bagFeeVatCents", sl."withholdingCents", sl."clawbackCents"
      FROM "settlement_lines" sl
      JOIN "settlement_batches" sb ON sb.id = sl."batchId"
      JOIN "payments" p ON p."reservationId" = sl."reservationId"
      WHERE sl."clawbackAppliedAt" IS NULL
        AND sb."merchantId" = ${merchantId}
        AND sb."status" IN ('SENT', 'SETTLED')
        AND EXISTS (
          SELECT 1 FROM "refunds" rf
          WHERE rf."paymentId" = p.id AND rf."status" IN ('DONE', 'SENT')
        )
      ORDER BY sl."redeemedAt" ASC
      FOR UPDATE OF sl
    `);

    const candidates: ClawbackCandidate[] = rows
      .map((r) => {
        const fullDemandCents = Math.max(
          0,
          r.grossCents - r.bagFeeCents - r.bagFeeVatCents - r.withholdingCents,
        );
        const remainingCents = Math.max(0, fullDemandCents - r.clawbackCents);
        return {
          reservationId: r.reservationId,
          priorClawbackCents: r.clawbackCents,
          fullDemandCents,
          remainingCents,
        };
      })
      .filter((c) => c.remainingCents > 0);
    const totalCents = candidates.reduce((sum, c) => sum + c.remainingCents, 0);
    return { totalCents, candidates };
  }

  /** The merchant's single most-recently-CREATED batch, excluding the one
   * currently being recomputed. Only inherits if that most-recent batch is
   * still HELD (an already-resolved prior batch, HELD or not, must never
   * be looked at again — see the class doc comment's "chain, one link at a
   * time" reasoning). Called ONLY on a batch's first-ever recompute pass
   * (see recomputeBatch's `isFirstPass` gate — [Fix round, C2]).
   *
   * [Fix round, C2 — second-order fix] What gets inherited is NOT the
   * predecessor's full `carriedShortfallCents`. That total is the SUM of
   * two things with very different re-discoverability:
   *   - the predecessor's OWN fee/withholding deficit (its lines' bagFee +
   *     VAT + withholding simply exceeded its own gross) — this has NO
   *     representation anywhere except this batch row; if not carried
   *     forward explicitly here, it is gone for good.
   *   - unresolved refund-clawback demand (fresh or itself inherited from
   *     an earlier link in the chain) — this DOES have an independent
   *     representation: every settlement_line with clawbackAppliedAt still
   *     NULL stays visible to lockPendingClawback() for EVERY future batch
   *     of this merchant, regardless of which batch is HELD in between.
   * Inheriting the full total here double-counts that second component —
   * proven by a real scenario built while writing this fix's test: two
   * refunded lines from one SENT batch partially absorbed by a HELD
   * successor (one line fully resolved, one left with a remainder); if the
   * THIRD batch inherited the second batch's full carriedShortfallCents
   * AND separately had lockPendingClawback re-find that same still-open
   * line, the remaining demand would be charged twice. So this method
   * returns exactly:
   *   predecessor's OWN fee deficit (re-derived here from its stored
   *     totals — max(0, -(gross - bagFee - bagFeeVat - withholding -
   *     membershipOffset)), the same "avail2 negative" case
   *     computeSettlement treats as the deficit component of its own
   *     shortfall output)
   *   + predecessor.carriedExternalDemandCents (what THAT batch itself
   *     still owed from ITS OWN predecessor, unresolved — recursing the
   *     same split back through the chain; this is NOT the same as its
   *     carriedShortfallCents, which also includes fresh line-attributable
   *     clawback the predecessor happened to face on its own last pass).
   * Verified by node simulation for a 3-batch chain mixing both fee-
   * deficit-only and clawback-only links before writing this: sums
   * correctly with no double count and no silent loss either way.
   *
   * [Fix round, I5] Locks the candidate row (`FOR UPDATE`) — defense in
   * depth against two DIFFERENT brand-new batches for the same merchant
   * (different days) being first-computed concurrently and both reading
   * the same predecessor before either commits; deterministic tie-break
   * (`id DESC` after `createdAt DESC`) since two batches created within
   * the same millisecond would otherwise order arbitrarily.
   */
  private async resolveCarriedShortfall(
    tx: Prisma.TransactionClient,
    merchantId: string,
    excludeBatchId: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<
      {
        status: string;
        grossCents: number;
        bagFeeCents: number;
        bagFeeVatCents: number;
        withholdingCents: number;
        membershipOffsetCents: number;
        carriedExternalDemandCents: number;
      }[]
    >(Prisma.sql`
      SELECT "status", "grossCents", "bagFeeCents", "bagFeeVatCents",
        "withholdingCents", "membershipOffsetCents", "carriedExternalDemandCents"
      FROM "settlement_batches"
      WHERE "merchantId" = ${merchantId} AND "id" != ${excludeBatchId}
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 1
      FOR UPDATE
    `);
    const mostRecent = rows[0];
    if (mostRecent?.status !== "HELD") {
      return 0;
    }
    const ownFeeDeficitCents = Math.max(
      0,
      -(
        mostRecent.grossCents -
        mostRecent.bagFeeCents -
        mostRecent.bagFeeVatCents -
        mostRecent.withholdingCents -
        mostRecent.membershipOffsetCents
      ),
    );
    return ownFeeDeficitCents + mostRecent.carriedExternalDemandCents;
  }
}
