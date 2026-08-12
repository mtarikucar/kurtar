import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { OfferStockService } from "../reservations/offer-stock.service";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { toPrismaPaymentProvider } from "../payments-core/payment-provider.mapping";
import { ParsedWebhookEvent } from "../payments-core/payment-provider.interface";

export type SettleOutcome =
  | "confirmed"
  | "expired"
  | "duplicate"
  | "unknown_merchant_oid"
  | "amount_mismatch"
  | "already_terminal";

function hashEvent(event: ParsedWebhookEvent): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

/**
 * The one place a Payment/Reservation pair actually settles. Called from
 * two places that must behave identically: PaymentsWebhookController (a
 * real inbound delivery) and PaymentsSweeperService (a synthesized event
 * from polling facade.queryStatus on a stale INTENT/PROCESSING payment) —
 * see the sweeper's doc comment for why its "unpaid past TTL" branch also
 * reuses this method's failure path rather than duplicating the
 * Payment-FAILED/Reservation-EXPIRED/release-stock logic.
 *
 * Two-phase idempotency, matching the brief exactly:
 *   1. WebhookEventLog.create() first, as its OWN statement (not inside
 *      the $transaction below). A unique-violation on externalEventId
 *      means this exact delivery already ran — return immediately. This
 *      is what makes N genuinely-parallel deliveries of the SAME payload
 *      settle exactly once: Postgres's unique index lets only one of the
 *      N concurrent INSERTs succeed.
 *   2. Only then the $transaction that actually mutates Payment/
 *      Reservation/DailyOffer, itself guarded by a SECOND, independent
 *      idempotency mechanism: every write is a compound-WHERE update
 *      (`status IN (INTENT, PROCESSING)` / `status = PENDING_PAYMENT` /
 *      `status = CONFIRMED`) so a Payment that's already left the state
 *      this call expects is a clean no-op, not a double effect. This
 *      second mechanism is what protects a race between TWO DIFFERENT
 *      externalEventIds targeting the same merchantOid (a late webhook
 *      landing at the same moment the sweeper's synthetic expiry event
 *      does) — WebhookEventLog dedup alone can't catch that, since they're
 *      different event ids.
 *
 * Known gap (documented, not fixed here — no outbox/saga infra exists
 * yet and adding one is out of scope for this task): if the process
 * crashes strictly between step 1 committing and step 2 committing, the
 * event is recorded as "processed" but nothing was actually settled. A
 * stuck Payment in that narrow window would need manual/ops recovery.
 */
@Injectable()
export class PaymentSettleService {
  private readonly logger = new Logger(PaymentSettleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offerStock: OfferStockService,
    private readonly facade: PaymentsFacadeService,
  ) {}

  async settle(event: ParsedWebhookEvent): Promise<SettleOutcome> {
    try {
      await this.prisma.webhookEventLog.create({
        data: {
          provider: toPrismaPaymentProvider(this.facade.activeProviderId()),
          externalEventId: event.externalEventId,
          payloadHash: hashEvent(event),
          processedAt: new Date(),
        },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err, "externalEventId")) {
        this.logger.warn(
          `Duplicate webhook event ${event.externalEventId} for merchantOid=${event.merchantOid} — already processed`,
        );
        return "duplicate";
      }
      throw err;
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { merchantOid: event.merchantOid },
        include: { reservation: true },
      });
      if (!payment) {
        this.logger.warn(
          `Webhook settle: unknown merchantOid=${event.merchantOid} (status=${event.status}) — acknowledged, no settlement path`,
        );
        return "unknown_merchant_oid";
      }

      if (event.status === "success") {
        if (event.totalCents !== payment.amountCents) {
          this.logger.error(
            `CRITICAL amount mismatch for merchantOid=${event.merchantOid}: expected ${payment.amountCents}, webhook reported ${event.totalCents} — NOT settling`,
          );
          return "amount_mismatch";
        }

        const updated = await tx.payment.updateMany({
          where: {
            merchantOid: event.merchantOid,
            status: { in: ["INTENT", "PROCESSING"] },
          },
          data: { status: "PAID", paidAt: new Date() },
        });
        if (updated.count === 0) {
          this.logger.warn(
            `Payment ${event.merchantOid} already left INTENT/PROCESSING — success settle is a no-op (already settled, or sweeper-expired first)`,
          );
          return "already_terminal";
        }

        await tx.reservation.updateMany({
          where: { id: payment.reservationId, status: "PENDING_PAYMENT" },
          data: { status: "CONFIRMED" },
        });
        return "confirmed";
      }

      // event.status === "failed" — real provider failure callback, or the
      // sweeper's synthetic "still unpaid past the TTL" event.
      const updated = await tx.payment.updateMany({
        where: {
          merchantOid: event.merchantOid,
          status: { in: ["INTENT", "PROCESSING"] },
        },
        data: { status: "FAILED" },
      });
      if (updated.count === 0) {
        this.logger.warn(
          `Payment ${event.merchantOid} already left INTENT/PROCESSING — failure settle is a no-op (already settled elsewhere)`,
        );
        return "already_terminal";
      }

      await tx.reservation.updateMany({
        where: { id: payment.reservationId, status: "PENDING_PAYMENT" },
        data: { status: "EXPIRED" },
      });
      await this.offerStock.release(
        tx,
        payment.reservation.offerId,
        payment.reservation.qty,
      );
      return "expired";
    });
  }
}
