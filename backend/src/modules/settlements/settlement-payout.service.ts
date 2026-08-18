import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SettlementBatch } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { OutboxService } from "../outbox/outbox.service";
import { OUTBOX_EVENT_TYPES } from "../outbox/event-types";
import { OpsAlertService } from "../notifications/email/ops-alert.service";
import { PublicHolidayService } from "./public-holiday.service";
import { addBusinessDays } from "./business-days";
import { allowedFromStatusesFor } from "./settlement-transitions";

const RECONCILIATION_OVERDUE_MS = 3 * 24 * 60 * 60 * 1000;
/** [Fix round #6, I3/M3] The bound the sibling sweeps already had
 * (complaint-sla-cron.service.ts, moderation-takedown-cron.service.ts):
 * a backlog is worked oldest-first over several ticks rather than scanned
 * whole in one. */
const BATCH_LIMIT = 500;
/** [Fix round #6, I4] How far ahead of `dueAt` the pre-breach warning
 * fires, on the SAME business-day calendar that produced dueAt in the
 * first place (settlement-batch-builder.service.ts). */
const PAYOUT_DUE_WARNING_BUSINESS_DAYS = 1;

interface StaleSentRow {
  id: string;
  merchantId: string;
  sentAt: Date | null;
  netPayoutCents: number;
}

interface UnsentRow {
  id: string;
  merchantId: string;
  dueAt: Date | null;
  status: string;
  netPayoutCents: number;
}
// [Fix round, I13] Derived from the transitions map, not hand-typed — see
// settlement-transitions.ts's doc comment on why that matters (this is
// exactly the kind of guard that silently drifted between call sites
// before the map existed).
const SENT_FROM_STATUSES = allowedFromStatusesFor("SENT");

/**
 * APPROVED -> SENT payout execution (brief §3) + the SENT-not-SETTLED
 * reconciliation alert. Split from settlements.service.ts (admin/merchant
 * CRUD) — this file's whole job is the provider call + the transactional
 * outbox emit around it, a different concern (and a different I/O
 * discipline: this is the ONE place in the settlements module that
 * touches PaymentsFacadeService) from batch listing/approval.
 *
 * PAYOUT IDEMPOTENCY: the provider call happens OUTSIDE any DB
 * transaction (never block a row lock on network I/O), which means two
 * overlapping cron ticks (or a manual admin retry racing the cron) CAN
 * both reach `facade.payout(...)` for the SAME batch before either's own
 * DB write commits. This is safe ONLY because `payout()`'s idempotency
 * key (`ref` = the batch id) makes the PROVIDER itself return the exact
 * same PayoutResult for both calls (see PaymentProvider.payout's doc
 * comment); the SUBSEQUENT guarded `updateMany(status: APPROVED -> SENT)`
 * then lets exactly one of the two transactions actually flip the row and
 * publish the outbox event — the loser's updateMany matches 0 rows and
 * re-reads the winner's already-committed state instead of re-publishing.
 *
 * AMOUNT IMMUTABILITY [Fix round, C3]: idempotency-by-ref alone is not
 * enough — it proves a REPEATED call is safe, but says nothing about
 * whether `batch.netPayoutCents` was still the SAME value on both calls.
 * Without a guard, this sequence loses money: payout(ref, 10000) succeeds
 * at the provider -> an admin holds the batch in the gap before markSent
 * commits (the guarded updateMany below matches 0 rows, nothing recorded)
 * -> a later recompute lands a clawback, netPayoutCents becomes 8000 ->
 * admin approves again -> payout(ref, 8000) is called, but the provider's
 * OWN idempotency (MockPaymentProvider.payout) returns the ORIGINAL
 * 10000-kuruş transfer's ref while THIS code goes on to record the batch
 * as SENT/8000 — a 2000-kuruş gap with no book entry anywhere. `executeOne`
 * now stamps `payoutAttemptedAt` in a guarded UPDATE BEFORE ever calling
 * the provider; `hold()`/`recomputeBatch()` both refuse to touch a batch
 * once that is set, freezing `netPayoutCents` from that instant on — so a
 * retried `payout()` call is now provably calling with the SAME amount
 * every time. MockPaymentProvider.payout() also independently asserts
 * amount-consistency for a repeated ref, so a regression here fails loud
 * in tests rather than silently losing money again.
 */
@Injectable()
export class SettlementPayoutService {
  private readonly logger = new Logger(SettlementPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facade: PaymentsFacadeService,
    private readonly outbox: OutboxService,
    private readonly holidays: PublicHolidayService,
    private readonly opsAlert: OpsAlertService,
  ) {}

  @Cron("*/5 * * * *", { name: "settlement-payout-execute" })
  async executeApprovedPayoutsCron(): Promise<void> {
    const result = await this.executeApprovedPayouts();
    if (result.attempted > 0) {
      this.logger.log(
        `Settlement payout tick: attempted ${result.attempted}, sent ${result.sent}, stillApproved ${result.stillApproved}`,
      );
    }
  }

  /** Not private — realdb specs call this directly instead of waiting on
   * the cron schedule. */
  async executeApprovedPayouts(): Promise<{
    attempted: number;
    sent: number;
    stillApproved: number;
  }> {
    const approved = await this.prisma.settlementBatch.findMany({
      where: { status: "APPROVED" },
      select: { id: true },
    });

    let sent = 0;
    let stillApproved = 0;
    for (const { id } of approved) {
      const result = await this.executeOne(id);
      if (result.status === "SENT") sent++;
      else stillApproved++;
    }
    return { attempted: approved.length, sent, stillApproved };
  }

  /** Execute (or no-op past) the APPROVED -> SENT transition for exactly
   * one batch. Public — the admin `retry` endpoint calls this directly
   * for an on-demand retry rather than waiting for the next cron tick. */
  async executeOne(batchId: string): Promise<SettlementBatch> {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id: batchId },
      include: {
        merchant: { select: { iban: true, pspSubMerchantKey: true } },
      },
    });
    if (!batch) {
      throw new NotFoundException({
        statusCode: 404,
        errorCode: "SETTLEMENT_BATCH_NOT_FOUND",
        message: "Settlement batch not found.",
      });
    }
    if (batch.status !== "APPROVED") {
      // Already moved on (SENT by a concurrent tick, or held/failed) —
      // idempotent no-op, matching the shape of every other guarded
      // transition in this codebase.
      return batch;
    }

    if (batch.netPayoutCents === 0) {
      // Nothing to transfer — bag fee/membership invoicing still applies
      // (settlement.batch.sent.v1 fires either way), but calling a real
      // payout provider to move ₺0 is meaningless and some providers
      // reject it outright.
      return this.markSent(batch.id, "no-transfer-zero-net");
    }

    // [Fix round, C3] Freeze the amount BEFORE ever calling the provider.
    // Guarded so this only actually flips the row the FIRST time (a retry
    // — this same batch reaching executeOne again after a prior failed
    // provider call — sees it already set and just proceeds straight to
    // the provider call below with the confirmed-frozen
    // `batch.netPayoutCents` read above, which cannot have changed since:
    // hold()/recomputeBatch() both refuse a batch with this set).
    //
    // [Fix round #2, C3-residual] The guarded updateMany's result used to
    // be discarded — if adminHold (or a concurrent recompute) flips the
    // batch's status away from APPROVED in the window between the
    // findUnique read above and THIS statement, the WHERE clause matches
    // 0 rows (nothing gets stamped), but execution fell through and
    // called the provider anyway with the now-possibly-stale
    // `batch.netPayoutCents` read before the race — the provider would
    // move money for a batch that is no longer authoritatively APPROVED,
    // and markSent's own guard further down would then ALSO match 0 rows
    // (the batch is HELD, not APPROVED), leaving a payout with no
    // pspTransferRef/sentAt recorded anywhere. Now captures the count and
    // bails out — re-reading and returning the batch's actual current
    // state — instead of proceeding, exactly mirroring how markSent
    // itself already treats a lost race (re-read, never double-act).
    if (batch.payoutAttemptedAt === null) {
      const stamped = await this.prisma.settlementBatch.updateMany({
        where: { id: batchId, status: "APPROVED", payoutAttemptedAt: null },
        data: { payoutAttemptedAt: new Date() },
      });
      if (stamped.count === 0) {
        this.logger.warn(
          `executeOne: batch ${batchId} was concurrently modified (held or already attempted) between read and stamp — not calling the provider, re-reading current state.`,
        );
        return this.prisma.settlementBatch.findUniqueOrThrow({
          where: { id: batchId },
        });
      }
    }

    const merchantRef = batch.merchant.pspSubMerchantKey || batch.merchant.iban;
    let pspTransferRef: string;
    try {
      const result = await this.facade.payout(
        merchantRef,
        batch.netPayoutCents,
        batch.id,
      );
      pspTransferRef = result.pspTransferRef;
    } catch (err) {
      this.logger.error(
        `Payout failed for settlement batch ${batch.id} (merchant ${batch.merchantId}, ${batch.netPayoutCents} kuruş): ${(err as Error).message} — staying APPROVED, retried next tick.`,
      );
      return batch;
    }

    return this.markSent(batch.id, pspTransferRef);
  }

  private async markSent(
    batchId: string,
    pspTransferRef: string,
  ): Promise<SettlementBatch> {
    return this.prisma.$transaction(async (tx) => {
      const guarded = await tx.settlementBatch.updateMany({
        where: { id: batchId, status: { in: SENT_FROM_STATUSES } },
        data: { status: "SENT", pspTransferRef, sentAt: new Date() },
      });
      const fresh = await tx.settlementBatch.findUniqueOrThrow({
        where: { id: batchId },
      });
      if (guarded.count === 0) {
        // Lost the race to a concurrent execution — the batch is already
        // SENT (or moved on further) with its OWN pspTransferRef/outbox
        // event; returning the current row is correct, publishing a
        // second settlement.batch.sent.v1 here would double-email/
        // double-invoice.
        return fresh;
      }

      const payload = {
        batchId,
        merchantId: fresh.merchantId,
        periodStart: fresh.periodStart.toISOString(),
        periodEnd: fresh.periodEnd.toISOString(),
        netPayoutCents: fresh.netPayoutCents,
        pspTransferRef,
      };
      // Two independent events (same payload, different types) — one
      // handler per type (OutboxHandlerRegistry), so the email leg
      // (SettlementSentEmailHandler) and the invoice-drafting leg
      // (SettlementSentInvoiceHandler) each get their own row and their
      // own retry/backoff/DEAD lifecycle, exactly like
      // OFFER_CANCELLED_MERCHANT_EMAIL_V1's split from offer.cancelled.v1.
      await this.outbox.publish(tx, {
        type: OUTBOX_EVENT_TYPES.SETTLEMENT_BATCH_SENT_V1,
        payload,
        idempotencyKey: `settlement-batch-sent:${batchId}`,
      });
      await this.outbox.publish(tx, {
        type: OUTBOX_EVENT_TYPES.SETTLEMENT_BATCH_SENT_INVOICE_V1,
        payload,
        idempotencyKey: `settlement-batch-sent-invoice:${batchId}`,
      });
      return fresh;
    });
  }

  /**
   * [Fix round #6, M7] Cron entry point — `timeZone` pinned like the
   * nightly batch builder's (the runbook presents all of these on one
   * clock, and the container runs UTC), and the tick is wrapped so an
   * uncaught rejection cannot vanish inside @nestjs/schedule. Every
   * branch below is idempotent, so a failed tick simply retries tomorrow.
   */
  @Cron("0 9 * * *", {
    name: "settlement-reconciliation",
    timeZone: "Europe/Istanbul",
  })
  async reconcileStuckBatchesCron(): Promise<void> {
    try {
      await this.reconcileStuckBatches(new Date());
    } catch (err) {
      this.logger.error(
        `settlement-reconciliation: tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Daily alert sweep — reports (never auto-transitions) three
   * conditions:
   *
   *  (a) a SENT batch not yet SETTLED 3+ days later. There is still no
   *      AUTOMATED SENT->SETTLED path (that needs a real bank/PSP
   *      reconciliation feed), so this stays purely an ops alarm — but it
   *      is no longer unclearable: [Cross-lane fix, M3] an admin who
   *      reconciles the batch against the bank statement now closes it
   *      via POST /admin/settlements/{id}/settle
   *      (SettlementsService.adminMarkSettled), which is precisely the
   *      action this alert exists to prompt.
   *  (b) [Fix round #6, I4, NEW] a batch approaching its `dueAt` — one
   *      business day out, on the same calendar that produced dueAt. The
   *      5-business-day payout promise is the one REGULATED clock in this
   *      product and it was the only one with no warning before the
   *      breach and no channel beyond a log line.
   *  (c) a batch still CALCULATED/APPROVED/HELD past its own `dueAt` —
   *      the SLA is already missed and an admin must act (approve, or
   *      investigate a HELD one).
   *
   * [Fix round #6, I3/M3] THREE THINGS CHANGED, all of them about the
   * alert being usable rather than about what counts as overdue:
   *
   *  1. SENTINEL COLUMNS. Each branch now claims its rows with a guarded
   *     `UPDATE ... WHERE <sentinel> IS NULL ... RETURNING`, so a batch
   *     alerts ONCE. Branch (a) in particular could never be cleared —
   *     nothing in this codebase writes SETTLED — so it re-emitted the
   *     same CRITICAL lines for the same batches every single day,
   *     forever, and buried branch (c) underneath itself. (That missing
   *     SENT->SETTLED writer has since landed as the admin settle
   *     action, so the set now genuinely drains; alerting once is still
   *     what keeps a slow reconciliation from drowning branch (c).)
   *  2. BOUNDED AND ORDERED. `LIMIT BATCH_LIMIT` + oldest-first, exactly
   *     like complaint-sla-cron and moderation-takedown-cron, instead of
   *     an unbounded findMany.
   *  3. ONE AGGREGATE LOG LINE PER BRANCH plus an OPS_ALERT_EMAIL digest
   *     — the payout SLA now reaches a human through the same channel
   *     the complaint and takedown SLAs already use, degrading to the
   *     log line when OPS_ALERT_EMAIL is unset.
   *
   * Not private / takes an explicit `now` — specs drive it directly
   * rather than waiting on the schedule.
   */
  async reconcileStuckBatches(now: Date = new Date()): Promise<{
    staleSentCount: number;
    dueSoonCount: number;
    overdueUnsentCount: number;
  }> {
    const staleSent = await this.claimStaleSent(now);
    if (staleSent.length > 0) {
      this.logger.error(
        `CRITICAL: ${staleSent.length} settlement batch(es) have been SENT for more than ${RECONCILIATION_OVERDUE_MS / 86_400_000} days without being SETTLED — manual bank/PSP reconciliation needed: ${staleSent.map((b) => b.id).join(", ")}`,
      );
      await this.opsAlert.trySend(
        "Hakediş ödemeleri mutabakat bekliyor (SENT → SETTLED)",
        `${staleSent.length} hakediş, ödeme gönderildikten ${RECONCILIATION_OVERDUE_MS / 86_400_000} gün sonra hâlâ banka/PSP tarafında mutabık kılınmadı:`,
        staleSent.map(
          (b) =>
            `${b.id} — işletme ${b.merchantId} — ${b.netPayoutCents} kuruş — gönderim: ${b.sentAt?.toISOString() ?? "—"}`,
        ),
      );
    }

    const dueSoon = await this.claimApproachingDue(now);
    if (dueSoon.length > 0) {
      this.logger.warn(
        `${dueSoon.length} settlement batch(es) are within ${PAYOUT_DUE_WARNING_BUSINESS_DAYS} business day(s) of their 5-business-day payout deadline and are still unsent: ${dueSoon.map((b) => b.id).join(", ")}`,
      );
      await this.opsAlert.trySend(
        "Hakediş ödeme süresi doluyor (5 iş günü)",
        `${dueSoon.length} hakediş, 5 iş günlük ödeme süresinin son iş gününe girdi ve hâlâ gönderilmedi:`,
        dueSoon.map(
          (b) =>
            `${b.id} — işletme ${b.merchantId} — ${b.status} — ${b.netPayoutCents} kuruş — son tarih: ${b.dueAt?.toISOString() ?? "—"}`,
        ),
      );
    }

    const overdueUnsent = await this.claimOverdueUnsent(now);
    if (overdueUnsent.length > 0) {
      this.logger.error(
        `CRITICAL: ${overdueUnsent.length} settlement batch(es) are PAST their 5-business-day dueAt and still unsent — SLA missed, admin action needed: ${overdueUnsent.map((b) => `${b.id} (${b.status})`).join(", ")}`,
      );
      await this.opsAlert.trySend(
        "Hakediş ödeme süresi AŞILDI (5 iş günü)",
        `${overdueUnsent.length} hakediş, 5 iş günlük ödeme süresini aştığı hâlde hâlâ gönderilmedi — yasal taahhüt ihlal edildi:`,
        overdueUnsent.map(
          (b) =>
            `${b.id} — işletme ${b.merchantId} — ${b.status} — ${b.netPayoutCents} kuruş — son tarih: ${b.dueAt?.toISOString() ?? "—"}`,
        ),
      );
    }

    return {
      staleSentCount: staleSent.length,
      dueSoonCount: dueSoon.length,
      overdueUnsentCount: overdueUnsent.length,
    };
  }

  /** Branch (a). Enum values are inline SQL literals (never bound
   * parameters) — a bound parameter arrives as text and does not compare
   * against a Postgres enum column; the sibling crons' raw sweeps do the
   * same for the same reason. */
  private async claimStaleSent(now: Date): Promise<StaleSentRow[]> {
    const threshold = new Date(now.getTime() - RECONCILIATION_OVERDUE_MS);
    return this.prisma.$queryRaw<StaleSentRow[]>`
      UPDATE "settlement_batches"
      SET "reconciliationAlertSentAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM "settlement_batches"
        WHERE "status" = 'SENT'
          AND "sentAt" <= ${threshold}
          AND "reconciliationAlertSentAt" IS NULL
        ORDER BY "sentAt" ASC
        LIMIT ${BATCH_LIMIT}
      )
      RETURNING "id", "merchantId", "sentAt", "netPayoutCents"
    `;
  }

  /** Branch (b) — the pre-breach warning. The window is computed with
   * `addBusinessDays`, the same helper that produced `dueAt`, so "one
   * business day out" means the same thing on both sides of the
   * comparison (weekends and Turkish public holidays included). */
  private async claimApproachingDue(now: Date): Promise<UnsentRow[]> {
    const holidaySet = await this.holidays.getHolidayDateKeys();
    const warnThreshold = addBusinessDays(
      now,
      PAYOUT_DUE_WARNING_BUSINESS_DAYS,
      holidaySet,
    );
    return this.prisma.$queryRaw<UnsentRow[]>`
      UPDATE "settlement_batches"
      SET "payoutDueWarningSentAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM "settlement_batches"
        WHERE "status" IN ('CALCULATED', 'APPROVED', 'HELD')
          AND "dueAt" IS NOT NULL
          AND "dueAt" > ${now}
          AND "dueAt" <= ${warnThreshold}
          AND "payoutDueWarningSentAt" IS NULL
        ORDER BY "dueAt" ASC
        LIMIT ${BATCH_LIMIT}
      )
      RETURNING "id", "merchantId", "dueAt", "status"::text AS "status", "netPayoutCents"
    `;
  }

  /** Branch (c) — the breach itself. */
  private async claimOverdueUnsent(now: Date): Promise<UnsentRow[]> {
    return this.prisma.$queryRaw<UnsentRow[]>`
      UPDATE "settlement_batches"
      SET "payoutOverdueAlertSentAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM "settlement_batches"
        WHERE "status" IN ('CALCULATED', 'APPROVED', 'HELD')
          AND "dueAt" IS NOT NULL
          AND "dueAt" <= ${now}
          AND "payoutOverdueAlertSentAt" IS NULL
        ORDER BY "dueAt" ASC
        LIMIT ${BATCH_LIMIT}
      )
      RETURNING "id", "merchantId", "dueAt", "status"::text AS "status", "netPayoutCents"
    `;
  }
}
