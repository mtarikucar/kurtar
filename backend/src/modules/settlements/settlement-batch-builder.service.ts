import { ConflictException, Injectable, Logger } from "@nestjs/common";
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

/** [Fix round #5, follow-up] One merchant's nightly work that did not
 * complete. Collected instead of thrown, so a single merchant needing
 * reconciliation cannot stop the platform's night — and surfaced in the
 * cycle's result (logged by the cron, returned by the admin trigger) so it
 * is visible rather than silently swallowed. `merchantId` is null only for
 * a failure of the platform-wide clawback scan itself. */
export interface NightlyCycleFailure {
  merchantId: string | null;
  stage: "batch" | "clawback-sweep" | "clawback-sweep-scan";
  message: string;
}

/** [Fix round #6, C1] A settlement line that has been COMPUTED but not yet
 * inserted. `createOrExtendBatch` hands these to `recomputeBatch`, which
 * inserts them INSIDE its own transaction — see recomputeBatch's doc
 * comment for the orphaning bug that boundary closes. */
export interface PendingSettlementLine {
  reservationId: string;
  redeemedAt: Date;
  grossCents: number;
  bagFeeCents: number;
  bagFeeVatCents: number;
  withholdingCents: number;
}

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

/** A HELD batch's EXPORTABLE demand — what a successor may take over from
 * it: its own fee deficit (its lines' fees + withholding + membership
 * offset exceeded its gross) plus whatever it had itself inherited and not
 * yet absorbed. A batch that is not HELD exports NOTHING: it either paid
 * out or is still being computed, and in both cases it has no unresolved
 * demand for anyone else to carry.
 *
 * [Fix round #5] The single definition. `resolveCarriedDemandFromSource`
 * (what a successor may claim) and `assertIrrevocableClaimsHonoured` (what
 * a source must still cover) both call it, so "how much does this batch
 * owe forward" cannot be two different numbers depending on which side is
 * asking — which is exactly how the frozen copy drifted from its source in
 * the first place. */
function exportableCarriedDemandCents(batch: {
  status: string;
  grossCents: number;
  bagFeeCents: number;
  bagFeeVatCents: number;
  withholdingCents: number;
  membershipOffsetCents: number;
  carriedExternalDemandCents: number;
}): number {
  if (batch.status !== "HELD") return 0;
  const ownFeeDeficitCents = Math.max(
    0,
    -(
      batch.grossCents -
      batch.bagFeeCents -
      batch.bagFeeVatCents -
      batch.withholdingCents -
      batch.membershipOffsetCents
    ),
  );
  return ownFeeDeficitCents + batch.carriedExternalDemandCents;
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
    if (result.failures.length > 0) {
      this.logger.error(
        `Nightly settlement batch: ${result.failures.length} merchant(s) need reconciliation and were skipped — ${result.failures
          .map((f) => `${f.merchantId ?? "platform"} (${f.stage})`)
          .join(", ")}`,
      );
    }
  }

  /** Not private — realdb specs (and the admin trigger endpoint) call
   * this directly (once, or concurrently from two harness instances)
   * instead of waiting on the cron schedule. Returns every batch id
   * touched this run. */
  async runNightlyCycle(
    now: Date,
  ): Promise<{ batchIds: string[]; failures: NightlyCycleFailure[] }> {
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
    // [Fix round #5, follow-up] PER-MERCHANT ISOLATION. Every merchant's
    // work is its own failure domain. Before this, one merchant's
    // exception — and this round made an exception REACHABLE, via
    // assertIrrevocableClaimsHonoured's deliberate refusal — aborted the
    // whole cycle: every remaining group AND the entire clawback-only
    // sweep below. Since the eligibility scan is ordered by `redeemedAt`
    // ascending, a single merchant with an old redemption sat at the front
    // and could take down most of the platform's night. One merchant's
    // reconciliation item must never stop everybody else from being paid.
    //
    // Failures are collected and returned (and logged by the cron and
    // surfaced by the admin trigger's response) rather than swallowed: an
    // isolated failure that nobody can see is its own defect.
    const failures: NightlyCycleFailure[] = [];
    const isolate = async (
      merchantId: string,
      stage: NightlyCycleFailure["stage"],
      work: () => Promise<void>,
    ) => {
      try {
        await work();
      } catch (err) {
        const error = err as Error;
        failures.push({ merchantId, stage, message: error.message });
        this.logger.error(
          `Nightly settlement ${stage} failed for merchant ${merchantId}: ${error.message} — continuing with the remaining merchants.`,
        );
      }
    };

    for (const group of groups.values()) {
      merchantsWithFreshLines.add(group.merchantId);
      await isolate(group.merchantId, "batch", async () => {
        const { batchId, pendingLines } = await this.createOrExtendBatch(
          group.merchantId,
          group.dayKey,
          group.lines,
          group.redeemedAtByReservation,
        );
        await this.recomputeBatch(batchId, now, pendingLines);
        touched.add(batchId);
      });
    }

    // Clawback-only sweep: merchants with an unclaimed refund clawback but
    // NO fresh lines this cycle (a merchant WITH fresh lines already had
    // its clawback opportunistically absorbed by recomputeBatch above —
    // it queries pending clawback unconditionally, not just for the
    // clawback-only path). Reached even when every group above failed,
    // which was NOT true before this fix.
    let clawbackMerchantIds: string[] = [];
    try {
      clawbackMerchantIds = await this.findMerchantsWithPendingClawback();
    } catch (err) {
      const error = err as Error;
      failures.push({
        merchantId: null,
        stage: "clawback-sweep-scan",
        message: error.message,
      });
      this.logger.error(
        `Nightly settlement clawback sweep scan failed: ${error.message} — the batches above are unaffected.`,
      );
    }
    const todayKey = istanbulDateKey(now);
    for (const merchantId of clawbackMerchantIds) {
      if (merchantsWithFreshLines.has(merchantId)) continue;
      await isolate(merchantId, "clawback-sweep", async () => {
        // [Fix round #6, M2] Recompute the merchant's EXISTING open batch
        // when it has one, and only mint a fresh (empty) batch when it has
        // none. Before this, the sweep always built for `todayKey` — a
        // different (merchantId, periodStart) key every night — so a
        // merchant whose clawback demand cannot be absorbed (nothing new
        // being earned) collected one brand-new empty HELD batch per night,
        // forever: none of them chains anything forward
        // (exportableCarriedDemandCents is 0 for an empty batch), each one
        // re-appears in the payout SLA alert once its own dueAt passes, and
        // the demand is simply re-discovered by the same scan the next
        // night. One standing open batch carries the same information
        // without the daily litter.
        const openBatch = await this.prisma.settlementBatch.findFirst({
          where: {
            merchantId,
            status: { in: [...RECOMPUTABLE_SETTLEMENT_STATUSES] },
          },
          orderBy: { periodStart: "desc" },
          select: { id: true },
        });
        const batchId =
          openBatch?.id ??
          (await this.createOrExtendBatch(merchantId, todayKey, [], new Map()))
            .batchId;
        await this.recomputeBatch(batchId, now);
        touched.add(batchId);
      });
    }

    return { batchIds: Array.from(touched), failures };
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
   * `dayKey`) and COMPUTE (never insert — see below) `lines` as
   * PendingSettlementLine rows. Per-line bagFee/VAT/withholding for the
   * NEW rows is computed via a throwaway computeSettlement() call (its
   * aggregate is discarded — recomputeBatch, called right after by every
   * caller, is the authoritative aggregate over ALL the batch's lines, old
   * and new).
   *
   * [Fix round #6, C1] The rows are RETURNED, not written. They are
   * inserted by `recomputeBatch` inside the same transaction that
   * re-derives the batch from them, with the same `skipDuplicates: true`
   * that makes "each reservation lands in exactly one line" true under
   * concurrency (two callers racing the SAME candidate reservation both
   * attempt the insert; Postgres's unique index on reservationId lets only
   * one succeed, and `skipDuplicates` means the loser's whole statement
   * does not abort over it). What changed is only WHERE the insert
   * commits: a recompute that refuses now takes its lines down with it,
   * instead of leaving them committed against a batch that never counted
   * them. See recomputeBatch's doc comment.
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
  ): Promise<{ batchId: string; pendingLines: PendingSettlementLine[] }> {
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

    if (lines.length === 0) return { batchId, pendingLines: [] };

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

    // [Fix round #6, C1] COMPUTED here, INSERTED by recomputeBatch inside
    // its own transaction — see recomputeBatch's doc comment.
    return {
      batchId,
      pendingLines: perLine.map((pl) => ({
        reservationId: pl.reservationId,
        redeemedAt: redeemedAtByReservation.get(pl.reservationId)!,
        grossCents: pl.grossCents,
        bagFeeCents: pl.bagFeeCents,
        bagFeeVatCents: pl.bagFeeVatCents,
        withholdingCents: pl.withholdingCents,
      })),
    };
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
   *
   * [Fix round #6, C1] `pendingLines` — the rows `createOrExtendBatch`
   * computed for this pass — are INSERTED HERE, inside this transaction,
   * rather than committed separately before it. They used to be written on
   * the root client, so the two writes had independent fates, and the one
   * that can legitimately refuse is this one: `assertIrrevocableClaimsHonoured`
   * throws SETTLEMENT_CARRIED_DEMAND_ALREADY_COLLECTED when a very-late
   * line would cure a HELD batch whose successor already collected the
   * carried demand and was paid. The refusal rolled the recompute back
   * while the lines stayed committed — and nothing in this codebase can
   * ever remove or re-point a settlement line (the only other writers are
   * two column-only updates), the nightly eligibility scan excludes a
   * reservation that HAS a line forever (`settlementLine: null`), and both
   * admin actions re-enter this method and re-throw. The merchant was
   * never paid for that work and the batch was wedged with no way out.
   *
   * Inside the transaction, the refusal takes the lines with it: nothing
   * is committed, the reservations keep `settlementLine: null`, and the
   * next nightly cycle re-discovers them and refuses again — a repeating,
   * self-healing reconciliation signal instead of a permanent silent loss.
   * The insert deliberately sits AFTER the recomputable/payoutAttemptedAt
   * guard: a batch that froze between `createOrExtendBatch` and here must
   * not receive lines it will never count either.
   */
  async recomputeBatch(
    batchId: string,
    now: Date,
    pendingLines: PendingSettlementLine[] = [],
  ): Promise<SettlementBatch> {
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
        if (pendingLines.length > 0) {
          this.logger.warn(
            `recomputeBatch: batch ${batchId} is ${batch.status}${batch.payoutAttemptedAt ? " with a payout already attempted" : ""} — NOT attaching ${pendingLines.length} newly-computed line(s); their reservations stay eligible and will be batched by the next cycle.`,
          );
        }
        return batch;
      }

      // [Fix round #6, C1] The lines join the batch here, in the same
      // transaction that re-derives it from them.
      if (pendingLines.length > 0) {
        await tx.settlementLine.createMany({
          data: pendingLines.map((pl) => ({ batchId, ...pl })),
          skipDuplicates: true,
        });
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

      // [Fix round #5] THE OTHER HALF OF priorClawbackCents. What a HELD
      // predecessor hands forward used to be an INFERRED COPY: read the
      // predecessor's own fee deficit once, freeze it into this batch's
      // inheritedExternalDemandCents, and record nothing on the
      // predecessor. Unlike a settled line's demand, that deficit is
      // MUTABLE — a HELD batch stays recomputable and `createOrExtendBatch`
      // deliberately adds very-late lines to it — so a cured predecessor
      // left this batch holding a claim on a demand that no longer existed
      // and charging the merchant for it a second time. Same class as the
      // four forgiveness bugs, opposite direction.
      //
      // Now it is a RECORDED, RETIRABLE claim, treated exactly like line
      // attribution:
      //   - the SOURCE is pinned once (`carriedDemandSourceBatchId`,
      //     write-once, pure identity) so a later pass cannot silently
      //     re-target a newer sibling;
      //   - the AMOUNT is re-derived from that pinned predecessor on EVERY
      //     pass and re-recorded as a claim row. This is not a bug-3
      //     relapse: the value is read from the PREDECESSOR, never from
      //     this batch's own earlier output, so R1 still holds;
      //   - this batch DELETES its own claim before re-deriving, so the
      //     "exclude everyone else's claims on the same source"
      //     subtraction inside resolveCarriedDemandFromSource is
      //     structural rather than arithmetic;
      //   - a predecessor that resolves (leaves HELD) or is cured exports
      //     0, so the claim is simply not re-created — retired, not
      //     forgotten.
      const isFirstPass = batch.shortfallResolvedAt === null;
      const carriedDemandSourceBatchId = isFirstPass
        ? await this.discoverCarriedDemandSource(tx, batch.merchantId, batchId)
        : batch.carriedDemandSourceBatchId;

      await tx.settlementCarriedDemandClaim.deleteMany({
        where: { claimantBatchId: batchId },
      });
      const carriedFromPrior = carriedDemandSourceBatchId
        ? await this.resolveCarriedDemandFromSource(
            tx,
            carriedDemandSourceBatchId,
            batchId,
          )
        : 0;
      if (carriedFromPrior > 0) {
        await tx.settlementCarriedDemandClaim.create({
          data: {
            claimantBatchId: batchId,
            sourceBatchId: carriedDemandSourceBatchId!,
            amountCents: carriedFromPrior,
          },
        });
      }

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
          // [Fix round #5] A PROJECTION of the claim row, written every
          // pass. Round #4 made this write-once to stop a batch reading
          // back its own mutated residual (bug 3) — correct then, but
          // freezing it is what let a claim outlive the demand that
          // justified it. R1 is preserved by the value's SOURCE, not by
          // freezing it: it comes from the pinned predecessor, never from
          // this batch's own earlier output. assertLedgerIdentity
          // cross-checks it against the persisted claim row.
          inheritedExternalDemandCents: carriedFromPrior,
          // The PIN is the write-once half: identity only, no money.
          ...(isFirstPass ? { carriedDemandSourceBatchId } : {}),
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
      // [Fix round #5, R3] ...and refuse to resolve away demand a
      // successor has already irrevocably collected on this batch's
      // behalf.
      await this.assertIrrevocableClaimsHonoured(tx, updated);

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
   *  - `clawbackBatchId` = the greatest allocating batchId, or NULL — a
   *    deterministic choice that does not depend on recompute order (see
   *    the orderBy below). It
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
        // [Fix round #5, LOW 1] Ordered by batchId ALONE — never by
        // createdAt. A recompute deletes and RE-INSERTS its rows with a
        // fresh CURRENT_TIMESTAMP, so a createdAt-first ordering made the
        // pointer below depend on which batch happened to recompute most
        // recently: recompute(b2),recompute(b3) and
        // recompute(b2),recompute(b3),recompute(b2) left different line
        // rows, contradicting "any order of operator actions produces
        // byte-identical rows". batchId is stable under re-insertion and
        // still meaningful (cuids are time-prefixed, so the greatest id is
        // the most recently created batch). No production reader consumes
        // this pointer — it is audit only — but an audit pointer that
        // flaps is still a broken invariant.
        orderBy: [{ batchId: "asc" }],
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
        // Ordered by batchId ascending above, so the last one seen is the
        // greatest — order-independent, unlike "most recently written".
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

    // [Fix round #5] The EXTERNAL half, now a genuine cross-representation
    // check rather than a round-trip of the same in-memory variable:
    // `inheritedExternalDemandCents` is a projection of the persisted
    // carried-demand claim, so re-reading the claim and comparing catches
    // a projection that drifted from its ledger exactly the way the line
    // half catches a line column that drifted from its allocations.
    const claim = await tx.settlementCarriedDemandClaim.findUnique({
      where: { claimantBatchId: batchId },
      select: { amountCents: true },
    });
    const claimedCents = claim?.amountCents ?? 0;
    if (batch.inheritedExternalDemandCents !== claimedCents) {
      throw new Error(
        `SETTLEMENT_LEDGER_DIVERGENCE: batch ${batchId} stores inheritedExternalDemandCents=${batch.inheritedExternalDemandCents} but its carried-demand claim records ${claimedCents}`,
      );
    }
    if (
      batch.carriedExternalDemandCents < 0 ||
      batch.carriedExternalDemandCents > batch.inheritedExternalDemandCents
    ) {
      throw new Error(
        `SETTLEMENT_LEDGER_DIVERGENCE: batch ${batchId} has carriedExternalDemandCents=${batch.carriedExternalDemandCents} outside [0, ${batch.inheritedExternalDemandCents}]`,
      );
    }

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

  /**
   * [Fix round #5] SOURCE DISCOVERY — identity only, no money, called on a
   * batch's first-ever pass and never again (the result is pinned in
   * `carriedDemandSourceBatchId`).
   *
   * The merchant's single most-recently-CREATED other batch, and only if
   * that batch is still HELD — an already-resolved predecessor has nothing
   * outstanding to hand forward, and the chain is walked one link at a
   * time (this batch inherits from its immediate predecessor, which in
   * turn inherited from its own). Pinning matters: without it, a later
   * pass would re-run this query and could silently re-target a NEWER
   * sibling created in the meantime, changing this batch's inherited
   * amount for a reason that has nothing to do with it.
   *
   * `FOR UPDATE` on the candidate — defence in depth against two different
   * brand-new batches for the same merchant being first-computed
   * concurrently and both pinning the same predecessor before either
   * commits. Deterministic tie-break (`id DESC` after `createdAt DESC`)
   * since two batches created within the same millisecond would otherwise
   * order arbitrarily.
   *
   * WHAT IS AND IS NOT INHERITED is unchanged from fix round #2's
   * analysis, and still matters: the predecessor's `carriedShortfallCents`
   * is the SUM of two things with very different re-discoverability, and
   * only one of them may be carried here.
   *   - its OWN fee/withholding deficit — no representation anywhere
   *     except that batch row, so it must be handed forward explicitly;
   *   - unresolved refund-clawback demand — which HAS an independent
   *     representation: every settlement_line whose allocations do not yet
   *     cover its demand stays visible to EVERY future batch's candidate
   *     query. Carrying it here as well would charge it twice.
   * `exportableCarriedDemandCents` therefore returns own-fee-deficit +
   * the predecessor's own unabsorbed inherited residual, never its full
   * carriedShortfallCents.
   */
  private async discoverCarriedDemandSource(
    tx: Prisma.TransactionClient,
    merchantId: string,
    excludeBatchId: string,
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string; status: string }[]>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "settlement_batches"
        WHERE "merchantId" = ${merchantId} AND "id" != ${excludeBatchId}
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT 1
        FOR UPDATE
      `,
    );
    const mostRecent = rows[0];
    return mostRecent?.status === "HELD" ? mostRecent.id : null;
  }

  /**
   * [Fix round #5] How much of the pinned predecessor's demand this batch
   * may take over, re-derived from the predecessor's CURRENT state on
   * every pass.
   *
   * `FOR UPDATE` on the source serialises this against the source's own
   * concurrent recompute, so a claim can never be sized against a state
   * that is being rewritten underneath it.
   *
   * The subtraction of OTHER claims on the same source is structural, not
   * defensive arithmetic: the caller has already DELETEd its own claim
   * row, so everything this query still sees belongs to somebody else and
   * has already been taken over by them. In the normal chain there is at
   * most one claimant per source (once a successor exists it is the more
   * recent batch, so the next batch pins IT, not the original), but the
   * subtraction means two claimants racing the same predecessor cannot
   * both take the whole amount.
   */
  private async resolveCarriedDemandFromSource(
    tx: Prisma.TransactionClient,
    sourceBatchId: string,
    claimantBatchId: string,
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
      WHERE "id" = ${sourceBatchId}
      FOR UPDATE
    `);
    const source = rows[0];
    if (!source) return 0;

    const exportable = exportableCarriedDemandCents(source);
    if (exportable <= 0) return 0;

    const others = await tx.settlementCarriedDemandClaim.findMany({
      where: { sourceBatchId, claimantBatchId: { not: claimantBatchId } },
      select: { amountCents: true },
    });
    const alreadyTaken = others.reduce((sum, c) => sum + c.amountCents, 0);
    return Math.max(0, exportable - alreadyTaken);
  }

  /**
   * [Fix round #5, R3] The SOURCE-side tripwire, the counterpart to
   * assertLedgerIdentity's claimant-side one.
   *
   * A claim held by a batch that can still recompute is always retirable:
   * the moment this batch's demand shrinks, that successor's next pass
   * re-derives a smaller claim (or none). A claim held by a batch that can
   * NO LONGER recompute — anything outside CALCULATED/HELD — is committed
   * money: it was withheld from a payout that has been approved or already
   * sent, and nothing can hand it back through the claimant.
   *
   * So if this batch's recompute would leave it exporting LESS than such a
   * claim already collected, the two ledgers have genuinely parted company
   * and the merchant has been charged for a demand that no longer exists.
   * That cannot be corrected from inside this transaction — returning the
   * difference means increasing a payout, which is a credit
   * `computeSettlement` has no term for and which four audits have
   * verified must not be reworked here. So this refuses to commit, with a
   * named error, exactly as C3's `SETTLEMENT_PAYOUT_ALREADY_ATTEMPTED`
   * refuses to re-open a batch whose money is already in flight: the batch
   * keeps its previous, self-consistent state and an operator gets a loud,
   * specific reconciliation signal instead of a silent under-payment.
   *
   * This is the one corner of the class that is contained rather than
   * eliminated — see task-8-report.md §15 for the precise statement.
   */
  private async assertIrrevocableClaimsHonoured(
    tx: Prisma.TransactionClient,
    batch: SettlementBatch,
  ): Promise<void> {
    const claims = await tx.settlementCarriedDemandClaim.findMany({
      where: { sourceBatchId: batch.id },
      select: {
        claimantBatchId: true,
        amountCents: true,
        claimantBatch: { select: { status: true } },
      },
    });
    if (claims.length === 0) return;

    const irrevocable = claims.filter(
      (c) => !RECOMPUTABLE_SETTLEMENT_STATUSES.includes(c.claimantBatch.status),
    );
    if (irrevocable.length === 0) return;

    const collected = irrevocable.reduce((sum, c) => sum + c.amountCents, 0);
    const exportable = exportableCarriedDemandCents(batch);
    if (collected > exportable) {
      // [Parked ruling 2] ConflictException, not a bare Error: an operator
      // hitting this through an admin endpoint sees the errorCode instead of
      // a generic 500. The code stays inside `message` too, so the cron log
      // line and the per-merchant failure entry both name it.
      throw new ConflictException({
        statusCode: 409,
        errorCode: "SETTLEMENT_CARRIED_DEMAND_ALREADY_COLLECTED",
        message: `SETTLEMENT_CARRIED_DEMAND_ALREADY_COLLECTED: batch ${batch.id} would export only ${exportable} kuruş after this recompute, but ${irrevocable
          .map(
            (c) =>
              `${c.claimantBatchId} (${c.claimantBatch.status}, ${c.amountCents})`,
          )
          .join(
            ", ",
          )} already withheld ${collected} kuruş of its demand from a payout that can no longer be recomputed. Refusing to commit — the difference is owed back to the merchant and needs manual reconciliation, not a silent re-derivation.`,
      });
    }
  }
}
