import { Injectable, Logger } from "@nestjs/common";
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

const PAYOUT_DUE_BUSINESS_DAYS = 5;

interface ClawbackCandidate {
  reservationId: string;
  clawbackCents: number;
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
 * on the batch, the membership subscription, and the specific clawback-
 * candidate lines), this is what makes two concurrent nightly runs safe:
 * whichever transaction gets there first serializes the other, which then
 * re-reads the now-current state and re-derives — never double-applies.
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

  /** Not private — realdb specs call this directly (once, or concurrently
   * from two harness instances) instead of waiting on the cron schedule.
   * Returns every batch id touched this run. */
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
          AND EXISTS (
            SELECT 1 FROM "refunds" rf
            WHERE rf."paymentId" = p.id AND rf."status" IN ('DONE', 'SENT')
          )
      `,
    );
    return rows.map((r) => r.merchantId);
  }

  /**
   * Find-or-create the CALCULATED batch for (merchantId, the Istanbul
   * calendar day `dayKey`), bulk-insert `lines` as new SettlementLine
   * rows with `skipDuplicates: true` — the actual mechanism that makes
   * "each reservation lands in exactly one line" true under concurrency:
   * two concurrent callers racing the SAME candidate reservation both
   * attempt the insert, Postgres's unique index on reservationId lets
   * only one succeed, `skipDuplicates` means the loser's whole batch
   * statement does not abort over it. Per-line bagFee/VAT/withholding for
   * the NEW rows is computed via a throwaway computeSettlement() call
   * (its aggregate is discarded — recomputeBatch, called right after by
   * every caller, is the authoritative aggregate over ALL the batch's
   * lines, old and new).
   *
   * BATCH CREATION is protected by a Postgres transaction-scoped advisory
   * lock keyed on (merchantId, dayKey) — NOT a partial unique index
   * (schema.prisma / Prisma's migration diffing has no portable way to
   * express "unique WHERE status = 'CALCULATED'" without hand-rolling a
   * SECOND permanent divergence between schema.prisma and the migrations
   * folder, on top of the one already accepted for stores.location's GIST
   * index — not worth doubling that CI-tolerance surface for what an
   * advisory lock already solves cleanly). `pg_advisory_xact_lock` blocks
   * a concurrently-racing transaction until this one commits (or rolls
   * back), auto-releasing at transaction end — no separate unlock call,
   * no risk of a stuck lock from a crashed process. `hashtext(...)` turns
   * the (merchantId, dayKey) string key into the bigint key
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
        where: { merchantId, periodStart, status: "CALCULATED" },
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
   * once a batch has left CALCULATED/HELD — SENT/SETTLED/APPROVED/FAILED
   * are frozen; APPROVED is included in the frozen set deliberately
   * (approve() itself is the LAST recompute a batch ever gets, performed
   * immediately before flipping to APPROVED in the same transaction —
   * see settlements.service.ts).
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
      if (batch.status !== "CALCULATED" && batch.status !== "HELD") {
        return batch;
      }

      const merchant = await tx.merchant.findUniqueOrThrow({
        where: { id: batch.merchantId },
        select: { bagFeeCentsOverride: true },
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
      );
      const membershipDueCents = due?.dueCents ?? 0;

      const clawback = await this.lockPendingClawback(tx, batch.merchantId);
      const carriedFromPrior = await this.resolveCarriedShortfall(
        tx,
        batch.merchantId,
        batchId,
      );
      const priorClawbackCents = clawback.totalCents + carriedFromPrior;

      const result = computeSettlement({
        lines,
        bagFeeCents,
        membershipDueCents,
        priorClawbackCents,
      });

      const updated = await tx.settlementBatch.update({
        where: { id: batchId },
        data: {
          grossCents: result.grossCents,
          bagFeeCents: result.bagFeeCents,
          bagFeeVatCents: result.bagFeeVatCents,
          withholdingCents: result.withholdingCents,
          membershipOffsetCents: result.membershipOffsetCents,
          refundClawbackCents: result.refundClawbackCents,
          netPayoutCents: result.netPayoutCents,
          carriedShortfallCents: result.carriedShortfallCents,
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

      if (clawback.candidates.length > 0) {
        await tx.settlementLine.updateMany({
          where: {
            reservationId: {
              in: clawback.candidates.map((c) => c.reservationId),
            },
            clawbackAppliedAt: null,
          },
          data: { clawbackAppliedAt: now, clawbackBatchId: batchId },
        });
      }

      if (due) {
        await this.membershipOffset.persistOffset(
          tx,
          due,
          membershipDueCents,
          result.membershipOffsetCents,
        );
      }

      return updated;
    });
  }

  /**
   * Locks (FOR UPDATE) every settlement_line whose refund clawback hasn't
   * been claimed yet for this merchant, BEFORE this transaction's
   * computeSettlement() call uses their sum. Without this lock, two
   * concurrent recomputeBatch calls for the same merchant (a fresh
   * today's batch and, say, an older still-open one, processed by two
   * overlapping cron ticks) could both read the SAME unclaimed clawback
   * total, both bake it into their own batch's aggregate, and only
   * discover the conflict at the final `updateMany` (clawbackAppliedAt:
   * null) — by which point one batch's ALREADY-COMMITTED totals would be
   * wrong (double-counted clawback), even though the underlying lines
   * were only ever claimed once. Locking here means the second
   * transaction BLOCKS until the first commits, then re-reads and
   * correctly sees these rows already gone from the unclaimed set.
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
      }[]
    >(Prisma.sql`
      SELECT sl."reservationId", sl."grossCents", sl."bagFeeCents", sl."bagFeeVatCents", sl."withholdingCents"
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
      FOR UPDATE OF sl
    `);

    const candidates: ClawbackCandidate[] = rows.map((r) => ({
      reservationId: r.reservationId,
      clawbackCents: Math.max(
        0,
        r.grossCents - r.bagFeeCents - r.bagFeeVatCents - r.withholdingCents,
      ),
    }));
    const totalCents = candidates.reduce((sum, c) => sum + c.clawbackCents, 0);
    return { totalCents, candidates };
  }

  /** The merchant's single most-recently-CREATED batch, excluding the one
   * currently being recomputed — its carriedShortfallCents rolls into
   * THIS batch's priorClawbackCents ONLY if that most-recent batch is
   * still HELD (an already-resolved prior batch, HELD or not, must never
   * be looked at again — see the class doc comment's "chain, one link at
   * a time" reasoning in task-8-report.md). */
  private async resolveCarriedShortfall(
    tx: Prisma.TransactionClient,
    merchantId: string,
    excludeBatchId: string,
  ): Promise<number> {
    const mostRecent = await tx.settlementBatch.findFirst({
      where: { merchantId, id: { not: excludeBatchId } },
      orderBy: { createdAt: "desc" },
    });
    if (mostRecent?.status === "HELD") {
      return mostRecent.carriedShortfallCents;
    }
    return 0;
  }
}
