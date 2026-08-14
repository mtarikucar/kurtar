import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SettlementBatch } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { OutboxService } from "../outbox/outbox.service";
import { OUTBOX_EVENT_TYPES } from "../outbox/event-types";

const RECONCILIATION_OVERDUE_MS = 3 * 24 * 60 * 60 * 1000;

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
 */
@Injectable()
export class SettlementPayoutService {
  private readonly logger = new Logger(SettlementPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facade: PaymentsFacadeService,
    private readonly outbox: OutboxService,
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
        where: { id: batchId, status: "APPROVED" },
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
   * Daily alert sweep — reports (never auto-transitions) two overdue
   * conditions: (a) the brief's literal ask, a SENT batch not yet SETTLED
   * 3+ days later (there is no automated SENT->SETTLED path in this task
   * — that requires a real bank/PSP reconciliation feed, out of scope —
   * so this is purely an ops alarm); (b) an extension this task adds
   * because it directly serves the core commercial promise ("payout due
   * <= 5 business days"): a batch still sitting CALCULATED/APPROVED/HELD
   * past its OWN `dueAt` has missed that SLA outright and needs an admin
   * to act (approve, or investigate a HELD one), not just wait quietly.
   */
  @Cron("0 9 * * *", { name: "settlement-reconciliation" })
  async reconcileStuckBatches(): Promise<{
    staleSentCount: number;
    overdueUnsentCount: number;
  }> {
    const now = new Date();
    const staleSentThreshold = new Date(
      now.getTime() - RECONCILIATION_OVERDUE_MS,
    );

    const staleSent = await this.prisma.settlementBatch.findMany({
      where: { status: "SENT", sentAt: { lte: staleSentThreshold } },
      select: {
        id: true,
        merchantId: true,
        sentAt: true,
        netPayoutCents: true,
      },
    });
    for (const b of staleSent) {
      this.logger.error(
        `CRITICAL: settlement batch ${b.id} (merchant ${b.merchantId}, ${b.netPayoutCents} kuruş) has been SENT since ${b.sentAt?.toISOString()} but is still not SETTLED — needs manual bank/PSP reconciliation.`,
      );
    }

    const overdueUnsent = await this.prisma.settlementBatch.findMany({
      where: {
        status: { in: ["CALCULATED", "APPROVED", "HELD"] },
        dueAt: { lte: now },
      },
      select: { id: true, merchantId: true, dueAt: true, status: true },
    });
    for (const b of overdueUnsent) {
      this.logger.error(
        `CRITICAL: settlement batch ${b.id} (merchant ${b.merchantId}) is past its 5-business-day dueAt (${b.dueAt?.toISOString()}) still in ${b.status} — SLA missed, needs admin action.`,
      );
    }

    return {
      staleSentCount: staleSent.length,
      overdueUnsentCount: overdueUnsent.length,
    };
  }
}
