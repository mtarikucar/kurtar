import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma, SettlementBatch } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  istanbulDateKey,
  offerDateToDbDate,
} from "../../common/utils/istanbul-date.util";
import { addBusinessDays } from "./business-days";
import {
  allocateClawback,
  ClawbackCandidate,
  computeSettlement,
  SettlementInputLine,
  totalClawbackDemandCents,
} from "./settlement-math";
import { PublicHolidayService } from "./public-holiday.service";
import { PricingService } from "./pricing.service";
import { MembershipOffsetService } from "../memberships/membership-offset.service";
import { RECOMPUTABLE_SETTLEMENT_STATUSES } from "./settlement-transitions";

const PAYOUT_DUE_BUSINESS_DAYS = 5;

/** One settlement line this recompute has LOCKED and is responsible for
 * re-projecting from the allocation ledger — whether or not it ends up
 * funding it. The set is the union of "still has outstanding clawback
 * demand" and "this batch currently holds an allocation against it", so
 * releasing a claim is covered by the same exhaustive write as taking
 * one. */
interface LockedClawbackLine {
  reservationId: string;
  /** grossCents - bagFeeCents - bagFeeVatCents - withholdingCents, floored
   * at 0. Immutable for the lifetime of a clawback candidate: the line
   * belongs to a SENT/SETTLED batch, which no recompute may touch. */
  fullDemandCents: number;
  /** Recovered by batches OTHER than the one recomputing. Read AFTER this
   * recompute deleted its own allocation rows, so it is "everyone else's"
   * by construction rather than by subtracting a remembered figure. */
  otherBatchesRecoveredCents: number;
}

/** A settled line's FULL clawback demand — the merchant's own share of it,
 * i.e. everything the platform actually paid out for that line. The single
 * definition: `lockAndResetOwnClawbackLedger`, `projectLinesFromLedger`
 * and `assertLedgerIdentity` all call it rather than re-spelling the
 * subtraction, and `findMerchantsWithPendingClawback`'s SQL mirrors it. */
function fullClawbackDemandCents(line: {
  grossCents: number;
  bagFeeCents: number;
  bagFeeVatCents: number;
  withholdingCents: number;
}): number {
  return Math.max(
    0,
    line.grossCents -
      line.bagFeeCents -
      line.bagFeeVatCents -
      line.withholdingCents,
  );
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
 *
 * ===================================================================
 * [Fix round #4] THE RECOMPUTE INVARIANTS — read this before changing
 * anything in `recomputeBatch`.
 * ===================================================================
 *
 * Four consecutive audits found FOUR instances of one defect, each a
 * column or a branch over from the last fix:
 *   1. `resolveCarriedShortfall` excluded the batch being recomputed, so a
 *      recompute forgave the shortfall it had itself inherited.
 *   2. `lockPendingClawback` filtered out lines this batch had already
 *      absorbed, so every `adminApprove` recompute forgave them.
 *   3. `carriedExternalDemandCents` was zeroed once absorbed, and the next
 *      pass read that zero as its own starting point.
 *   4. The allocation loop's `break`/`continue` skipped the per-line write
 *      while the batch row was rewritten without it, so the line ledger
 *      and the batch ledger diverged.
 *
 * They are all the same bug: A RECOMPUTE READ BACK A VALUE ITS OWN EARLIER
 * PASS HAD WRITTEN AND TREATED IT AS AN UNTOUCHED INPUT — or wrote one
 * half of a two-place fact and not the other. Patching them one at a time
 * did not converge, because each patch left the representation that makes
 * them expressible in place. So the representation changed. Three rules
 * now hold structurally, not by care:
 *
 * R1. NO INPUT OF A RECOMPUTE IS EVER AN OUTPUT OF THE SAME BATCH'S
 *     EARLIER PASS. Per-line clawback demand is read from
 *     `settlement_clawback_allocations` AFTER this batch has DELETEd every
 *     row it owns, so what it reads is other batches' recoveries by
 *     construction — there is no "subtract my own contribution back out"
 *     arithmetic left to get wrong, and no owner-pointer to misattribute
 *     (which is bugs 1, 2 and, in the multi-open-batch case the pointer
 *     could not represent at all, a fifth latent instance). The inherited
 *     external demand is read from `inheritedExternalDemandCents`, which
 *     is written ONCE on the first pass and never included in a later
 *     pass's UPDATE payload at all (bug 3). The membership balance is
 *     restored the same way (membership-offset.service.ts).
 *
 * R2. EVERY DECISION IS PROJECTED ONTO STORAGE EXHAUSTIVELY, WITH NO
 *     BRANCH ABLE TO SKIP A ROW. `allocateClawback` (pure, in
 *     settlement-math.ts) returns exactly one entry per candidate — a
 *     starved candidate is `absorbedCents: 0`, not a missing entry — and
 *     the write path is "delete all my allocation rows, insert the
 *     positive ones", so "fund nothing" and "release my claim" are the
 *     same write. Then EVERY locked line is re-projected from the ledger
 *     (`projectLinesFromLedger`) with `clawbackAppliedAt` written in both
 *     directions. There is no `break` and no `continue` on any write path
 *     (bug 4).
 *
 * R3. THE LEDGERS ARE RECONCILED AGAINST STORAGE BEFORE COMMIT.
 *     `assertLedgerIdentity` re-reads the persisted allocation rows and
 *     refuses to commit unless
 *       refundClawbackCents === externalAbsorbed + SUM(my allocations)
 *     and every touched line's `clawbackCents` equals the sum of ITS
 *     allocations. A future refactor that reintroduces any of the four
 *     bugs aborts the transaction instead of quietly paying the wrong
 *     amount.
 *
 * The invariant those three deliver, the one that actually matters: every
 * kuruş of clawback demand is, at all times, either recorded as withheld
 * against a specific batch (an allocation row) or visible to a future
 * batch's recovery query (`clawbackAppliedAt IS NULL` with a positive
 * remainder, which R2 guarantees is exactly the complement) — never
 * neither.
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

      // [Fix round #4, R1] Locks every line this recompute is responsible
      // for AND drops this batch's own allocation rows before reading the
      // ledger — so `otherBatchesRecoveredCents` below is other batches'
      // recoveries by construction. See the class doc comment.
      const lockedLines = await this.lockAndResetOwnClawbackLedger(
        tx,
        batch.merchantId,
        batchId,
      );
      const candidates: ClawbackCandidate[] = lockedLines.filter(
        (l) => l.fullDemandCents - l.otherBatchesRecoveredCents > 0,
      );

      // [Fix round, C2] Cross-batch shortfall inheritance happens EXACTLY
      // ONCE per batch, on its first-ever recompute pass — every later
      // pass (an admin retry on a HELD batch, or an "extend" adding new
      // lines to one) consumes the batch's OWN currently-stored inherited
      // amount instead of re-querying a sibling.
      //
      // [Fix round #3, C2-residual — CRITICAL] `carriedFromPrior` (this
      // pass's input into `priorClawbackCents`) now reads
      // `inheritedExternalDemandCents` — the IMMUTABLE original amount
      // inherited on the first pass — NOT `carriedExternalDemandCents`,
      // the mutable residual. Reading the residual here was C2's exact
      // shape one column over: a first pass that FULLY absorbs the
      // inherited demand X correctly writes the residual down to 0
      // (nothing left outstanding for a FUTURE batch to inherit) — but
      // the very next routine recompute (adminApprove's pre-lock pass,
      // or an admin retry) then read that same now-zero residual as ITS
      // OWN starting point, rederiving refundClawbackCents down to
      // whatever fresh line-clawback exists (often 0) and paying X back
      // out — money already recovered, forgiven on the operator's next
      // ordinary action, and genuinely unrecoverable afterward (a later
      // batch's resolveCarriedShortfall only inherits from a HELD
      // predecessor; this batch is APPROVED/SENT by then). Exactly the
      // same fix as the settlement_line half of C2: add back this
      // batch's own already-absorbed contribution before re-deriving.
      // Since nothing besides this batch's own passes ever touches its
      // private inherited amount, "add back what I absorbed" collapses
      // to "always re-read the full original" — see schema.prisma's doc
      // comment on `inheritedExternalDemandCents` for the algebra.
      //
      // `carriedExternalDemandCents` remains the mutable, every-pass-
      // rederived RESIDUAL (`inheritedExternalDemandCents -
      // externalAbsorbedThisPass` below) — what a FUTURE, DIFFERENT
      // batch's resolveCarriedShortfall reads if this one stays HELD.
      // That write is unchanged; only the READ that feeds THIS batch's
      // own `priorClawbackCents` moved to the immutable column.
      const isFirstPass = batch.shortfallResolvedAt === null;
      const carriedFromPrior = isFirstPass
        ? await this.resolveCarriedShortfall(tx, batch.merchantId, batchId)
        : batch.inheritedExternalDemandCents;

      const priorClawbackCents =
        totalClawbackDemandCents(candidates) + carriedFromPrior;

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

      // [Fix round #4, R2] ONE pure decision, then an exhaustive write.
      // The carried-external demand is absorbed FIRST (oldest debt),
      // then per-line demand oldest-redemption-first — and
      // `allocation.perCandidate` carries exactly one entry per candidate,
      // starved ones included, so the write loops below cannot skip a row.
      const allocation = allocateClawback({
        appliedClawbackCents: result.refundClawbackCents,
        externalDemandCents: carriedFromPrior,
        candidates,
      });
      const newCarriedExternalDemandCents =
        carriedFromPrior - allocation.externalAbsorbedCents;

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
          // [Fix round #4, R1] WRITE-ONCE, structurally: the immutable
          // inherited amount is in this payload on the first pass ONLY.
          // Round #3 wrote the same value back on every pass and relied on
          // it being identical; not offering the column to a later pass at
          // all is the same guarantee with nothing left to get wrong.
          ...(isFirstPass
            ? { inheritedExternalDemandCents: carriedFromPrior }
            : {}),
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

      // [Fix round #4, R2] Persist the allocation ledger. This batch's own
      // rows were already DELETEd by lockAndResetOwnClawbackLedger, so the
      // only write left is inserting the positive ones — a candidate the
      // allocator funded nothing simply has no row, which is the same
      // storage state as "released the claim I used to hold." There is no
      // per-candidate branch here at all.
      const funded = allocation.perCandidate.filter((a) => a.absorbedCents > 0);
      if (funded.length > 0) {
        await tx.settlementClawbackAllocation.createMany({
          data: funded.map((a) => ({
            batchId,
            reservationId: a.reservationId,
            amountCents: a.absorbedCents,
          })),
        });
      }

      // [Fix round #4, R2] Re-project EVERY locked line's denormalized
      // clawback columns from the ledger as it now stands on disk —
      // candidates and released ones alike, funded or starved. Reading
      // back rather than reusing the in-memory plan is deliberate: the
      // projection is then literally "what the ledger says", which is also
      // what makes the assertion below a real check instead of a restated
      // assumption.
      await this.projectLinesFromLedger(
        tx,
        lockedLines.map((l) => l.reservationId),
        now,
      );

      // [Fix round #4, R3] Refuse to commit a divergence.
      await this.assertLedgerIdentity(
        tx,
        batchId,
        updated,
        lockedLines.map((l) => l.reservationId),
      );

      return updated;
    });
  }

  /**
   * [Fix round #4, R2] Rewrites `clawbackCents`, `clawbackAppliedAt` and
   * `clawbackBatchId` on each given line from `settlement_clawback_
   * allocations` — the ONLY place those three are ever written. Every one
   * of them is written on every call, in both directions:
   *
   *  - `clawbackCents` = SUM of the line's allocations (0 when none).
   *  - `clawbackAppliedAt` = the moment the line BECAME fully resolved,
   *    and explicitly NULL whenever it is not. Clearing it is as
   *    important as setting it: an under-recovered line whose flag stayed
   *    set would match neither `findMerchantsWithPendingClawback` nor any
   *    batch's candidate query, and its residual would be owed by nobody
   *    and visible to no one. An ALREADY-resolved line that is still
   *    resolved keeps its original timestamp rather than being re-stamped
   *    with this pass's `now` — otherwise a repeat recompute with
   *    identical inputs would produce a different row, which is the
   *    idempotence half of this class of bug rather than the money half.
   *    (This test caught exactly that in review: `[m]`'s convergence
   *    assertion failed on a moving timestamp before the `??` below.)
   *  - `clawbackBatchId` = the most recent allocating batch, or NULL. It
   *    is an AUDIT POINTER ONLY. Per-batch attribution lives in the
   *    allocation rows; treating this single pointer as attribution is
   *    what made a line touched by two batches unattributable, and is the
   *    representation fix round #4 removed.
   *
   * A line with zero demand (fees ate its whole gross) is left with a NULL
   * flag: there is nothing to resolve, and the recovery queries exclude it
   * on the `remainder > 0` predicate anyway.
   */
  private async projectLinesFromLedger(
    tx: Prisma.TransactionClient,
    reservationIds: string[],
    now: Date,
  ): Promise<void> {
    if (reservationIds.length === 0) return;

    const [lines, allocations] = await Promise.all([
      tx.settlementLine.findMany({
        where: { reservationId: { in: reservationIds } },
        select: {
          reservationId: true,
          grossCents: true,
          bagFeeCents: true,
          bagFeeVatCents: true,
          withholdingCents: true,
          clawbackAppliedAt: true,
        },
      }),
      tx.settlementClawbackAllocation.findMany({
        where: { reservationId: { in: reservationIds } },
        orderBy: [{ createdAt: "asc" }, { batchId: "asc" }],
      }),
    ]);

    const byReservation = new Map<
      string,
      { total: number; lastBatchId: string }
    >();
    for (const a of allocations) {
      const current = byReservation.get(a.reservationId);
      byReservation.set(a.reservationId, {
        total: (current?.total ?? 0) + a.amountCents,
        // Ordered ascending above, so the last one seen is the most recent.
        lastBatchId: a.batchId,
      });
    }

    for (const line of lines) {
      const agg = byReservation.get(line.reservationId);
      const total = agg?.total ?? 0;
      const fullDemandCents = fullClawbackDemandCents(line);
      await tx.settlementLine.update({
        where: { reservationId: line.reservationId },
        data: {
          clawbackCents: total,
          clawbackBatchId: agg?.lastBatchId ?? null,
          clawbackAppliedAt:
            fullDemandCents > 0 && total >= fullDemandCents
              ? (line.clawbackAppliedAt ?? now)
              : null,
        },
      });
    }
  }

  /**
   * [Fix round #4, R3] The tripwire. Re-reads what was actually persisted
   * and refuses to let the transaction commit unless the batch ledger and
   * the line ledger agree:
   *
   *   refundClawbackCents
   *     === (inheritedExternalDemandCents - carriedExternalDemandCents)
   *       + SUM(this batch's allocation amounts)
   *
   * and, for every line this pass was RESPONSIBLE for — the candidates it
   * considered AND the ones whose claim it released, not merely the ones
   * it funded — that the line's own `clawbackCents` equals the sum of its
   * allocations and never exceeds its full demand. Checking only the
   * funded lines would miss bug 4 exactly, since that bug's signature is a
   * line the batch stopped funding and never rewrote.
   *
   * Every one of the four defects this class of fix was raised against
   * ended with two of these sides disagreeing. Throwing rolls the whole
   * recompute back, leaving the previous, self-consistent state in place:
   * a loud failure on one merchant's batch, never a quiet wrong payment.
   */
  private async assertLedgerIdentity(
    tx: Prisma.TransactionClient,
    batchId: string,
    batch: SettlementBatch,
    responsibleReservationIds: string[],
  ): Promise<void> {
    const mine = await tx.settlementClawbackAllocation.findMany({
      where: { batchId },
      select: { reservationId: true, amountCents: true },
    });
    const allocatedToLines = mine.reduce((s, a) => s + a.amountCents, 0);
    const externalAbsorbed =
      batch.inheritedExternalDemandCents - batch.carriedExternalDemandCents;

    if (allocatedToLines + externalAbsorbed !== batch.refundClawbackCents) {
      throw new Error(
        `SETTLEMENT_LEDGER_DIVERGENCE: batch ${batchId} recorded refundClawbackCents=${batch.refundClawbackCents} but its ledger accounts for ${externalAbsorbed} (external) + ${allocatedToLines} (lines) = ${allocatedToLines + externalAbsorbed}`,
      );
    }

    const touched = Array.from(
      new Set([
        ...responsibleReservationIds,
        ...mine.map((a) => a.reservationId),
      ]),
    );
    if (touched.length === 0) return;
    const [lines, allocations] = await Promise.all([
      tx.settlementLine.findMany({
        where: { reservationId: { in: touched } },
        select: {
          reservationId: true,
          clawbackCents: true,
          grossCents: true,
          bagFeeCents: true,
          bagFeeVatCents: true,
          withholdingCents: true,
        },
      }),
      tx.settlementClawbackAllocation.findMany({
        where: { reservationId: { in: touched } },
        select: { reservationId: true, amountCents: true },
      }),
    ]);
    const totals = new Map<string, number>();
    for (const a of allocations) {
      totals.set(
        a.reservationId,
        (totals.get(a.reservationId) ?? 0) + a.amountCents,
      );
    }
    for (const line of lines) {
      const total = totals.get(line.reservationId) ?? 0;
      if (line.clawbackCents !== total) {
        throw new Error(
          `SETTLEMENT_LEDGER_DIVERGENCE: line ${line.reservationId} stores clawbackCents=${line.clawbackCents} but its allocations sum to ${total}`,
        );
      }
      const fullDemandCents = fullClawbackDemandCents(line);
      if (total > fullDemandCents) {
        throw new Error(
          `SETTLEMENT_LEDGER_DIVERGENCE: line ${line.reservationId} has been over-recovered — allocations sum to ${total} against a full demand of ${fullDemandCents}`,
        );
      }
    }
  }

  /**
   * [Fix round #4, R1] Takes the row lock on every settlement line this
   * recompute is responsible for, then DELETES every allocation row this
   * batch owns — in that order, inside the caller's transaction.
   *
   * That delete is the whole point. Rounds #2 and #3 reconstructed "what
   * did I myself already withhold against this line?" arithmetically, by
   * subtracting a remembered figure back out of a cumulative column
   * (`clawbackCents` minus `clawbackCents if clawbackBatchId === me`).
   * That reconstruction is only correct while THIS batch is the sole
   * contributor: the moment a second still-open batch topped the same line
   * up, the pointer moved, the first batch's own contribution became
   * indistinguishable from everyone else's, and its next recompute either
   * forgave it or re-charged it — a fifth instance of the same class, one
   * step further out than the four that were reported.
   *
   * Deleting first replaces reconstruction with erasure: whatever remains
   * in the ledger afterwards IS other batches' recoveries, exactly, with
   * no arithmetic and no assumption about who touched what since. Any
   * number of open batches can hold partial claims on the same line and
   * each can re-derive its own independently.
   *
   * WHICH LINES. The union of two sets, so that releasing a claim is
   * covered by the same exhaustive write as taking one:
   *   (a) lines with an outstanding refund clawback for this merchant —
   *       belonging to a SENT/SETTLED batch (a line still being computed
   *       has not been paid out, so there is nothing to claw back), with a
   *       DONE/SENT refund, and not yet fully recovered; plus
   *   (b) lines this batch currently holds an allocation against — even
   *       fully-recovered ones, because this pass may have to give some or
   *       all of it back.
   *
   * WHY THE LOCK. Without it, two concurrent recomputes for the same
   * merchant (a fresh today's batch and an older still-open one, from two
   * overlapping cron ticks) could both read the same outstanding demand,
   * both bake it into their own aggregate, and only collide at write time
   * — by which point one batch's already-committed totals would be wrong.
   * `FOR UPDATE OF sl` makes the second transaction block until the first
   * commits, then re-read the now-current ledger. It is taken BEFORE the
   * delete so the delete/read/insert sequence for a line is serialized
   * end to end.
   */
  private async lockAndResetOwnClawbackLedger(
    tx: Prisma.TransactionClient,
    merchantId: string,
    batchId: string,
  ): Promise<LockedClawbackLine[]> {
    const rows = await tx.$queryRaw<
      {
        reservationId: string;
        grossCents: number;
        bagFeeCents: number;
        bagFeeVatCents: number;
        withholdingCents: number;
      }[]
    >(Prisma.sql`
      SELECT sl."reservationId", sl."grossCents", sl."bagFeeCents", sl."bagFeeVatCents", sl."withholdingCents"
      FROM "settlement_lines" sl
      JOIN "settlement_batches" sb ON sb.id = sl."batchId"
      WHERE sb."merchantId" = ${merchantId}
        AND (
          EXISTS (
            SELECT 1 FROM "settlement_clawback_allocations" a
            WHERE a."reservationId" = sl."reservationId" AND a."batchId" = ${batchId}
          )
          OR (
            sl."clawbackAppliedAt" IS NULL
            AND sb."status" IN ('SENT', 'SETTLED')
            AND EXISTS (
              SELECT 1 FROM "payments" p
              JOIN "refunds" rf ON rf."paymentId" = p.id
              WHERE p."reservationId" = sl."reservationId"
                AND rf."status" IN ('DONE', 'SENT')
            )
          )
        )
      ORDER BY sl."redeemedAt" ASC, sl."reservationId" ASC
      FOR UPDATE OF sl
    `);

    // Erase this batch's own claims BEFORE reading the ledger, so what is
    // read back cannot possibly include them.
    await tx.settlementClawbackAllocation.deleteMany({ where: { batchId } });

    const reservationIds = rows.map((r) => r.reservationId);
    const othersLedger =
      reservationIds.length === 0
        ? []
        : await tx.settlementClawbackAllocation.findMany({
            where: { reservationId: { in: reservationIds } },
            select: { reservationId: true, amountCents: true },
          });
    const otherRecovered = new Map<string, number>();
    for (const a of othersLedger) {
      otherRecovered.set(
        a.reservationId,
        (otherRecovered.get(a.reservationId) ?? 0) + a.amountCents,
      );
    }

    return rows.map((r) => ({
      reservationId: r.reservationId,
      fullDemandCents: fullClawbackDemandCents(r),
      otherBatchesRecoveredCents: otherRecovered.get(r.reservationId) ?? 0,
    }));
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
   *     NULL stays visible to the candidate query (lockAndResetOwnClawbackLedger) for EVERY future batch
   *     of this merchant, regardless of which batch is HELD in between.
   * Inheriting the full total here double-counts that second component —
   * proven by a real scenario built while writing this fix's test: two
   * refunded lines from one SENT batch partially absorbed by a HELD
   * successor (one line fully resolved, one left with a remainder); if the
   * THIRD batch inherited the second batch's full carriedShortfallCents
   * AND separately had the candidate query re-find that same still-open
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
