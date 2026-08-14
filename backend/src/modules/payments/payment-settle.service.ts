import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { Prisma, Payment, Reservation } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { OfferStockService } from "../reservations/offer-stock.service";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { toPrismaPaymentProvider } from "../payments-core/payment-provider.mapping";
import { ParsedWebhookEvent } from "../payments-core/payment-provider.interface";
import { allowedFromStatusesFor } from "../reservations/reservation-transitions";

export type SettleOutcome =
  | "confirmed"
  | "expired"
  | "amount_mismatch_quarantined"
  | "duplicate"
  | "unknown_merchant_oid"
  | "already_terminal"
  | "charged_after_failed"
  | "orphaned_success";

type PaymentWithReservation = Payment & { reservation: Reservation };

function hashEvent(event: ParsedWebhookEvent): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

// Single source of truth for which Reservation statuses each settle
// transition may start from — derived from reservation-transitions.ts
// (I4 fix) rather than hand-typed here a second time.
const CONFIRMABLE_FROM = allowedFromStatusesFor("CONFIRMED");
const EXPIRABLE_FROM = allowedFromStatusesFor("EXPIRED");

/**
 * Internal signal used to force the interactive $transaction below to roll
 * back while still letting settle() return a normal SettleOutcome to its
 * callers instead of propagating an exception — both callers (the webhook
 * controller and the sweeper) expect settle() to always resolve, never
 * throw, so a raw ACID rollback needs to surface as a return value, not an
 * error.
 */
class SettleRollback extends Error {
  constructor(readonly outcome: SettleOutcome) {
    super(`settle rollback: ${outcome}`);
  }
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
 *      idempotency mechanism: every write is a compound-WHERE update so a
 *      Payment/Reservation that's already left the state this call
 *      expects is a clean no-op, not a double effect. This second
 *      mechanism is what protects a race between TWO DIFFERENT
 *      externalEventIds targeting the same merchantOid (a late webhook
 *      landing at the same moment the sweeper's synthetic expiry event
 *      does) — WebhookEventLog dedup alone can't catch that, since they're
 *      different event ids.
 *
 * If the process crashes strictly between step 1 committing and step 2
 * committing, the event is recorded "processed" but nothing was actually
 * settled. This self-heals rather than needing manual ops recovery: the
 * Payment is still INTENT/PROCESSING (step 2 never touched it), so it
 * remains visible to PaymentsSweeperService's stale-intent query and gets
 * picked up on its next 5-minute tick with a FRESH synthetic
 * externalEventId — the crashed attempt's WebhookEventLog row (keyed to
 * the original, now-abandoned externalEventId) never blocks that retry.
 *
 * Lock order: every transaction below (and reservations.service.ts's
 * cancel()/compensateFailedIntent()) touches Payment before Reservation
 * before DailyOffer, consistently. Two transactions taking row locks on
 * the same tables in different orders is exactly how Postgres deadlocks
 * happen under concurrency (each waits on a lock the other holds) — a
 * single, universally-followed lock order across every writer is what
 * avoids that between a concurrent cancel() and settle() call for the
 * same reservation.
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

    try {
      return await this.prisma.$transaction(async (tx) => {
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
            // [I6] A mismatched amount used to leave the Payment sitting
            // in INTENT forever — re-swept every 5 minutes, logging
            // CRITICAL indefinitely, while the stock stayed locked. Now
            // quarantined through the SAME terminal path a genuine
            // failure takes (Payment FAILED, Reservation EXPIRED, stock
            // released) so the sweeper's stale-INTENT query naturally
            // stops selecting it. Releasing stock on a quarantine is a
            // deliberate policy call, not an oversight: the alternative
            // (holding the slot hostage forever on a payload we refuse to
            // trust) is strictly worse, and the CRITICAL log below is the
            // alarm that should draw ops attention regardless.
            this.logger.error(
              `CRITICAL amount mismatch for merchantOid=${event.merchantOid}: expected ${payment.amountCents}, webhook reported ${event.totalCents} — quarantining (Payment FAILED, stock released) rather than settling or leaving it stuck.`,
            );
            return this.expireAndRelease(
              tx,
              payment,
              "amount_mismatch_quarantined",
            );
          }
          return this.settleSuccess(tx, payment, event);
        }

        // event.status === "failed" — real provider failure callback, or
        // the sweeper's synthetic "still unpaid past the TTL" event.
        return this.expireAndRelease(tx, payment, "expired");
      });
    } catch (err) {
      if (err instanceof SettleRollback) {
        return err.outcome;
      }
      throw err;
    }
  }

  private async settleSuccess(
    tx: Prisma.TransactionClient,
    payment: PaymentWithReservation,
    event: ParsedWebhookEvent,
  ): Promise<SettleOutcome> {
    const paymentUpdated = await tx.payment.updateMany({
      where: {
        merchantOid: event.merchantOid,
        status: { in: ["INTENT", "PROCESSING"] },
      },
      data: { status: "PAID", paidAt: new Date() },
    });

    if (paymentUpdated.count === 0) {
      // [C2] Re-read rather than trust the pre-update `payment` snapshot —
      // under READ COMMITTED, this UPDATE's WHERE was evaluated against
      // whatever was current AT UPDATE TIME, which may differ from what
      // our earlier SELECT saw.
      const current = await tx.payment.findUniqueOrThrow({
        where: { merchantOid: event.merchantOid },
      });
      if (current.status === "FAILED") {
        // [C2] Distinct from the benign "already settled" case below: the
        // provider is telling us this charge succeeded, but we'd already
        // given up on the intent (expired/quarantined it). The customer
        // was charged for a reservation we no longer hold. This needs
        // manual reconciliation (refund or re-open), not a shrug.
        this.logger.error(
          `CRITICAL: success settle for merchantOid=${event.merchantOid} arrived after Payment was already FAILED — customer appears charged after we gave up on this intent; needs manual reconciliation.`,
        );
        return "charged_after_failed";
      }
      this.logger.warn(
        `Payment ${event.merchantOid} already left INTENT/PROCESSING (status=${current.status}) — success settle is a benign no-op (already settled elsewhere)`,
      );
      return "already_terminal";
    }

    const reservationUpdated = await tx.reservation.updateMany({
      where: { id: payment.reservationId, status: { in: CONFIRMABLE_FROM } },
      data: { status: "CONFIRMED" },
    });

    if (reservationUpdated.count === 0) {
      // [C2] The Payment side just succeeded (paid=true), but the
      // Reservation is no longer confirmable — e.g. the user cancelled it
      // concurrently. Leaving Payment as PAID here would silently charge
      // the customer for a reservation that no longer exists, with no
      // Refund row and a settle outcome that reads as success. Throwing
      // rolls back this WHOLE transaction, including the payment.updateMany
      // above, so Payment reverts to its pre-transaction state (still
      // INTENT/PROCESSING) instead of being stranded PAID.
      this.logger.error(
        `CRITICAL: merchantOid=${event.merchantOid} would settle PAID but reservation ${payment.reservationId} is no longer confirmable (already cancelled/expired) — refusing to settle; rolling back so the Payment stays INTENT/PROCESSING for the next reconciliation pass.`,
      );
      throw new SettleRollback("orphaned_success");
    }

    return "confirmed";
  }

  /**
   * Shared by the genuine "failed" event branch and the amount-mismatch
   * quarantine path: Payment -> FAILED, Reservation -> EXPIRED (only if
   * still in a state that transition is valid from), stock released — but
   * [C1 fix] ONLY if the reservation update actually matched a row. A
   * prior cancel() may already have moved the reservation out of
   * PENDING_PAYMENT and released its own stock (and, per the C1 fix in
   * reservations.service.ts, already terminated this same Payment) —
   * releasing again here would double-release, oversell the slot to a
   * second buyer while this reservation still exists. Gating the release
   * on the RESERVATION update's own rowcount, not just the payment
   * update's, is what closes that gap.
   */
  private async expireAndRelease(
    tx: Prisma.TransactionClient,
    payment: PaymentWithReservation,
    outcome: "expired" | "amount_mismatch_quarantined",
  ): Promise<SettleOutcome> {
    const paymentUpdated = await tx.payment.updateMany({
      where: {
        merchantOid: payment.merchantOid,
        status: { in: ["INTENT", "PROCESSING"] },
      },
      data: { status: "FAILED" },
    });
    if (paymentUpdated.count === 0) {
      this.logger.warn(
        `Payment ${payment.merchantOid} already left INTENT/PROCESSING — no-op (already settled elsewhere)`,
      );
      return "already_terminal";
    }

    const reservationUpdated = await tx.reservation.updateMany({
      where: { id: payment.reservationId, status: { in: EXPIRABLE_FROM } },
      data: { status: "EXPIRED" },
    });
    if (reservationUpdated.count === 0) {
      // [C1] Reservation was already moved out of PENDING_PAYMENT by
      // something else (most commonly cancel()) — that path already
      // released its own stock. Payment is still correctly marked FAILED
      // above; do NOT release stock a second time.
      this.logger.warn(
        `Reservation ${payment.reservationId} was already out of PENDING_PAYMENT when settling merchantOid=${payment.merchantOid} — Payment marked FAILED but stock was already released elsewhere; not double-releasing.`,
      );
      return outcome;
    }

    await this.offerStock.release(
      tx,
      payment.reservation.offerId,
      payment.reservation.qty,
    );
    return outcome;
  }
}
