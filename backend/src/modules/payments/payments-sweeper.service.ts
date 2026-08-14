import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { PaymentSettleService } from "./payment-settle.service";

const STALE_AFTER_MS = 10 * 60 * 1000; // 10 min

/**
 * Periodic sweep for Payments stuck in INTENT/PROCESSING — the buyer
 * closed the tab mid-checkout, the provider's webhook never arrived, etc.
 * For each stale payment, asks the provider what actually happened
 * (facade.queryStatus) and settles through the SAME PaymentSettleService
 * the webhook controller uses, by synthesizing a ParsedWebhookEvent:
 *   - provider says "paid"            -> a "success" event (shares the
 *     confirm path 1:1 with a real webhook, per the brief).
 *   - provider says "pending"/"failed" -> a "failed" event. Reusing
 *     settle()'s failure branch here (rather than duplicating its
 *     Payment-FAILED/Reservation-EXPIRED/release-stock logic inline) is a
 *     deliberate DRY choice beyond the brief's literal wording — it also
 *     means the sweeper and the settle service can NEVER disagree about
 *     what "expired" means, which is exactly the property the
 *     sweeper-vs-webhook race spec needs to hold.
 * "pending" is folded into the failure branch rather than left alone:
 * once a payment has been stale for 10+ minutes, an abandoned checkout
 * and an explicit provider failure both call for reclaiming the stock —
 * there is no story where holding a slot hostage indefinitely on a
 * still-pending intent is the right default.
 *
 * Each sweep run's externalEventId is a fresh random uuid, not derived
 * from the payment — the sweeper's idempotency comes entirely from
 * settle()'s compound-WHERE guarded updates, not from WebhookEventLog
 * matching (a Payment already moved out of INTENT/PROCESSING is simply
 * not selected by the query below on the next tick).
 *
 * Single-instance assumption: no advisory lock guards this cron against
 * running on two replicas at once (kds's self-pay-sweeper does, via
 * withAdvisoryLock). Out of scope for this task — settle()'s idempotency
 * already makes concurrent sweeps of the SAME payment harmless (a second
 * sweep's settle() call just no-ops), so a double-tick only wastes a
 * queryStatus call, never double-effects.
 */
@Injectable()
export class PaymentsSweeperService {
  private readonly logger = new Logger(PaymentsSweeperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facade: PaymentsFacadeService,
    private readonly settle: PaymentSettleService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, {
    name: "payments-sweep-stale-intents",
  })
  async sweepStaleIntents(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
    const stale = await this.prisma.payment.findMany({
      where: {
        status: { in: ["INTENT", "PROCESSING"] },
        createdAt: { lt: staleBefore },
      },
      select: { merchantOid: true, amountCents: true },
    });
    if (stale.length === 0) return;

    this.logger.log(`Sweeping ${stale.length} stale payment intent(s)`);
    for (const payment of stale) {
      await this.sweepOne(payment.merchantOid, payment.amountCents);
    }
  }

  /**
   * Not private — payment-settle.realdb.spec.ts's sweeper-vs-webhook race
   * instantiates this service directly and races a real call to this
   * method (queryStatus -> branch -> settle()) against a real webhook
   * delivery through PaymentsWebhookController, for the same merchantOid,
   * rather than waiting on the cron schedule or hand-rolling a synthetic
   * event that bypasses this method's own branching logic.
   */
  async sweepOne(
    merchantOid: string,
    fallbackAmountCents: number,
  ): Promise<void> {
    let queried;
    try {
      queried = await this.facade.queryStatus(merchantOid);
    } catch (err) {
      this.logger.error(
        `Sweeper: queryStatus failed for ${merchantOid}: ${(err as Error).message}`,
      );
      return; // leave it for the next tick
    }

    if (queried.status === "paid") {
      await this.settle.settle({
        merchantOid,
        status: "success",
        totalCents: queried.paidAmountCents ?? fallbackAmountCents,
        externalEventId: `sweep:${merchantOid}:${randomUUID()}`,
      });
      return;
    }

    await this.settle.settle({
      merchantOid,
      status: "failed",
      totalCents: fallbackAmountCents,
      externalEventId: `sweep:${merchantOid}:${randomUUID()}`,
    });
  }
}
