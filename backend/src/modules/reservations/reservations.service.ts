import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  Prisma,
  RefundReason,
  Reservation,
  ReservationStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import {
  istanbulDateKey,
  offerDateToDbDate,
} from "../../common/utils/istanbul-date.util";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { toPrismaPaymentProvider } from "../payments-core/payment-provider.mapping";
import { OfferStockService } from "./offer-stock.service";
import { generateReservationCode } from "./reservation-code.util";
import { generateMerchantOid } from "./merchant-oid.util";
import { allowedFromStatusesFor } from "./reservation-transitions";
import { OutboxService } from "../outbox/outbox.service";
import { OUTBOX_EVENT_TYPES } from "../outbox/event-types";

const RATING_INVITE_DELAY_MS = 2 * 60 * 60 * 1000; // 2h

const MAX_CODE_ATTEMPTS = 5;
const CANCEL_DEADLINE_BEFORE_PICKUP_MS = 2 * 60 * 60 * 1000; // 2h

// Single source of truth for which statuses a cancel/redeem/compensating-
// expiry may start from — derived from reservation-transitions.ts (I4 fix)
// rather than hand-typed here a second time. EXPIRABLE_FROM matches
// payment-settle.service.ts's own EXPIRABLE_FROM constant exactly (both
// derive from the same table).
const CANCELLABLE_FROM = allowedFromStatusesFor("CANCELLED_BY_USER");
const REDEEMABLE_FROM = allowedFromStatusesFor("REDEEMED");
const EXPIRABLE_FROM = allowedFromStatusesFor("EXPIRED");
// [Task 5] Same derivation, feeding cancelAllForOffer's CONFIRMED branch
// (the merchant-cancel / suspend kill-switch fan-out) below.
const CANCELLED_BY_MERCHANT_FROM = allowedFromStatusesFor(
  "CANCELLED_BY_MERCHANT",
);

export interface CreateReservationResult {
  reservationId: string;
  code: string;
  totalCents: number;
  payment: { merchantOid: string; redirectUrl?: string };
}

interface CommittedReservation {
  reservationId: string;
  code: string;
  offerId: string;
  qty: number;
  totalCents: number;
  merchantOid: string;
  idempotencyKey: string;
}

export interface ListReservationsResult {
  items: Reservation[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListReservationsForMerchantFilters {
  storeId?: string;
  offerId?: string;
  date?: string;
  status?: ReservationStatus[];
  page: number;
  pageSize: number;
}

/**
 * [Merchant pickup list] Deliberately NOT the Reservation model, and
 * deliberately NOT the consumer's own `user` object at all — the
 * merchant-facing pickup screen exists to greet a customer and match a
 * bag to a code, not to view an account. `customerFirstName` is the
 * FIRST TOKEN of User.name only (no phone, no email, no surname, no
 * userId) — `null` when the consumer never set a name (common: OTP
 * signup never asks for one). See firstNameOnly()'s own doc comment for
 * why this is a deliberate minimization, not an oversight.
 */
export interface ReservationForMerchantItem {
  id: string;
  storeId: string;
  offerId: string;
  code: string;
  qty: number;
  status: ReservationStatus;
  pickupStartAt: Date;
  pickupEndAt: Date;
  redeemedAt: Date | null;
  customerFirstName: string | null;
}

export interface ListReservationsForMerchantResult {
  items: ReservationForMerchantItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * [Merchant pickup list — PII minimization] The merchant's whole reason
 * to see this row is "does the person standing in front of me match this
 * bag" — a first name is enough for that ("Ayşe?" / "Hi, is this for
 * Mehmet?"); a phone number, email, surname, or the consumer's own
 * userId would hand the merchant identity data they have no operational
 * need for and the consumer never consented to sharing beyond "let this
 * specific merchant fulfill my order." `User.name` is a single free-text
 * field (no separate first/last columns — see schema.prisma), so "first
 * name only" means the first whitespace-separated token, not a real
 * structured first-name lookup; genuinely single-word names pass through
 * unchanged either way.
 */
function firstNameOnly(name: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

/** [Task 5] cancelAllForOffer's DB-write-only result — see its doc comment. */
export interface OfferCancelFanOutResult {
  expiredCount: number;
  cancelledCount: number;
  toRefund: Array<{
    reservationId: string;
    paymentId: string;
    merchantOid: string;
    amountCents: number;
  }>;
}

/** [Task 5] refundMany's per-reservation outcome — never throws, only reports. */
export interface RefundBatchOutcome {
  reservationId: string;
  ok: boolean;
  refundRef?: string;
  error?: string;
}

/** Reasons cancelAllForOffer/refundMany accept — a merchant's own cancel
 * always reports MERCHANT_CANCEL; an admin-triggered suspend kill-switch
 * (modules/merchants) reports ADMIN, since the acting party differs even
 * though the DB-level mechanics are identical. */
export type OfferCancelReason = Extract<
  RefundReason,
  "MERCHANT_CANCEL" | "ADMIN"
>;

function offerUnavailableError() {
  return new ConflictException({
    statusCode: 409,
    errorCode: "OFFER_UNAVAILABLE",
    message: "This offer is no longer available.",
  });
}

function reservationNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "RESERVATION_NOT_FOUND",
    message: "Reservation not found.",
  });
}

function notOwnerError() {
  return new ForbiddenException({
    statusCode: 403,
    errorCode: "FORBIDDEN",
    message: "This reservation does not belong to you.",
  });
}

function notCancellableError() {
  return new ConflictException({
    statusCode: 409,
    errorCode: "RESERVATION_NOT_CANCELLABLE",
    message: "This reservation can no longer be cancelled.",
  });
}

function notRedeemableError() {
  return new ConflictException({
    statusCode: 409,
    errorCode: "RESERVATION_NOT_REDEEMABLE",
    message: "This reservation cannot be redeemed right now.",
  });
}

/**
 * The reservations state machine, on top of the raw atomic stock
 * primitives in OfferStockService. Every write here that changes
 * Reservation.status goes through a compound-WHERE guarded update (never
 * a plain findUnique-then-update) so a concurrent transition — a redeem
 * racing another redeem, a webhook racing the sweeper's expiry — resolves
 * to exactly one effect. See payment-settle.service.ts for the
 * webhook/sweeper side of the same state machine (PENDING_PAYMENT ->
 * CONFIRMED / EXPIRED); this file owns everything else.
 *
 * Lock order: every transaction below that touches both Payment and
 * Reservation rows (cancel, compensateFailedIntent) does Payment first,
 * then Reservation, then DailyOffer — matching payment-settle.service.ts's
 * order exactly. Two transactions taking locks on the same rows in
 * different orders is the textbook Postgres deadlock; a single order
 * followed everywhere avoids it.
 */
@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offerStock: OfferStockService,
    private readonly facade: PaymentsFacadeService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    userId: string,
    offerId: string,
    qty: number,
  ): Promise<CreateReservationResult> {
    const committed = await this.createReservationWithRetry(
      userId,
      offerId,
      qty,
    );

    // Provider I/O happens strictly AFTER the DB transaction above
    // committed — never inside a $transaction. A slow or hanging provider
    // call must never hold the claim's row lock (or the Payment row) open.
    try {
      const intent = await this.facade.createIntent({
        merchantOid: committed.merchantOid,
        amountCents: committed.totalCents,
        idempotencyKey: committed.idempotencyKey,
      });

      // Best-effort only. Losing this write (e.g. a crash right here)
      // does not strand anything: the webhook/sweeper look Payment up by
      // merchantOid, never by pspPaymentId.
      await this.prisma.payment
        .update({
          where: { merchantOid: committed.merchantOid },
          data: { pspPaymentId: intent.providerRef },
        })
        .catch((err) =>
          this.logger.warn(
            `Failed to persist pspPaymentId for ${committed.merchantOid}: ${(err as Error).message}`,
          ),
        );

      return {
        reservationId: committed.reservationId,
        code: committed.code,
        totalCents: committed.totalCents,
        payment: {
          merchantOid: committed.merchantOid,
          redirectUrl: intent.redirectUrl,
        },
      };
    } catch (err) {
      await this.compensateFailedIntent(committed, err as Error);
      throw new ServiceUnavailableException({
        statusCode: 503,
        errorCode: "PAYMENT_PROVIDER_UNAVAILABLE",
        message:
          "Could not start payment for this reservation. Please try again.",
      });
    }
  }

  /**
   * [I3 fix] The reservation code collision-retry loop used to catch the
   * `code` unique-constraint violation FROM INSIDE the same interactive
   * $transaction and retry with `continue`. That doesn't work: once a
   * statement inside a Postgres transaction fails, the WHOLE transaction
   * enters an aborted state (`current transaction is aborted, commands
   * ignored until end of transaction block`) — every subsequent statement,
   * including the retry's INSERT, fails with 25P02 rather than a fresh
   * P2002, so `isUniqueConstraintViolation` never matches on the retry and
   * the whole call 500s. The fix retries the ENTIRE transaction (a fresh
   * $transaction call, fresh code, fresh stock claim) rather than a single
   * statement inside one — safe because a failed transaction rolls back
   * everything it did, including the stock claim, so the retry starts
   * clean.
   */
  private async createReservationWithRetry(
    userId: string,
    offerId: string,
    qty: number,
  ): Promise<CommittedReservation> {
    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx): Promise<CommittedReservation> => {
            const offer = await tx.dailyOffer.findUnique({
              where: { id: offerId },
              include: { bagTemplate: true },
            });
            if (!offer) {
              throw new NotFoundException({
                statusCode: 404,
                errorCode: "OFFER_NOT_FOUND",
                message: "This offer does not exist.",
              });
            }

            // Atomic claim FIRST: whether this succeeds is independent of
            // the `offer` row we just read above (the raw UPDATE's WHERE
            // clause re-checks status/qty against the live row, not our
            // stale read) — see OfferStockService.claim's doc comment for
            // why that's safe under concurrency.
            const claimed = await this.offerStock.claim(tx, offerId, qty);
            if (!claimed) {
              throw offerUnavailableError();
            }

            // Price NEVER comes from the client — always the current
            // BagTemplate.priceCents, read server-side, inside this same
            // transaction.
            const unitPriceCents = offer.bagTemplate.priceCents;
            const totalCents = unitPriceCents * qty;
            const cancelDeadlineAt = new Date(
              offer.pickupStartAt.getTime() - CANCEL_DEADLINE_BEFORE_PICKUP_MS,
            );

            // Fresh code every attempt; a P2002 on `code` here propagates
            // straight out of the transaction (no swallow-and-continue
            // inside the tx — see this method's doc comment for why).
            const code = generateReservationCode();
            const reservation = await tx.reservation.create({
              data: {
                userId,
                offerId,
                storeId: offer.storeId,
                qty,
                unitPriceCents,
                totalCents,
                cancelDeadlineAt,
                code,
              },
            });

            const merchantOid = generateMerchantOid(reservation.id);
            const idempotencyKey = `resv:${merchantOid}:${reservation.id}`;
            const providerId = this.facade.activeProviderId();

            await tx.payment.create({
              data: {
                reservationId: reservation.id,
                provider: toPrismaPaymentProvider(providerId),
                merchantOid,
                amountCents: totalCents,
                idempotencyKey,
              },
            });

            return {
              reservationId: reservation.id,
              code: reservation.code,
              offerId,
              qty,
              totalCents,
              merchantOid,
              idempotencyKey,
            };
          },
        );
      } catch (err) {
        if (
          isUniqueConstraintViolation(err, "code") &&
          attempt < MAX_CODE_ATTEMPTS
        ) {
          this.logger.warn(
            `Reservation code collision on attempt ${attempt}/${MAX_CODE_ATTEMPTS} — retrying with a fresh code`,
          );
          continue;
        }
        throw err;
      }
    }
    /* istanbul ignore next -- unreachable: the loop above always returns or throws */
    throw new Error("Failed to generate a unique reservation code");
  }

  /**
   * COMPENSATION for a createIntent failure discovered after the create
   * transaction already committed. Unwinds all three effects in a second
   * transaction: Payment -> FAILED, Reservation -> EXPIRED, stock
   * released back to the offer (flipping SOLD_OUT -> PUBLISHED if that
   * opens up room) — [C1 fix] but the release only runs if the
   * Reservation update actually matched a row, mirroring
   * payment-settle.service.ts's expireAndRelease(). Without that gate, a
   * user who cancels their own just-created reservation in the narrow
   * window between create()'s transaction committing and this
   * compensation running would cause a double stock release (cancel()
   * releases once, this would release again unconditionally) — an
   * oversell bug identical in shape to the one payment-settle.service.ts
   * had.
   */
  private async compensateFailedIntent(
    committed: CommittedReservation,
    cause: Error,
  ): Promise<void> {
    this.logger.error(
      `createIntent failed for merchantOid=${committed.merchantOid}, compensating: ${cause.message}`,
    );
    await this.prisma.$transaction(async (tx) => {
      const paymentUpdated = await tx.payment.updateMany({
        where: { merchantOid: committed.merchantOid, status: "INTENT" },
        data: { status: "FAILED" },
      });
      if (paymentUpdated.count === 0) {
        // A concurrent webhook/sweeper already moved this Payment out of
        // INTENT — nothing left to compensate.
        return;
      }
      const reservationUpdated = await tx.reservation.updateMany({
        where: {
          id: committed.reservationId,
          status: { in: EXPIRABLE_FROM },
        },
        data: { status: "EXPIRED" },
      });
      if (reservationUpdated.count === 0) {
        // [C1] Reservation already left PENDING_PAYMENT via another path
        // (e.g. the user cancelled it) — that path already released its
        // own stock. Do not release again.
        this.logger.warn(
          `Reservation ${committed.reservationId} already left PENDING_PAYMENT before compensation ran — Payment marked FAILED but stock was already released elsewhere; not double-releasing.`,
        );
        return;
      }
      await this.offerStock.release(tx, committed.offerId, committed.qty);
    });
  }

  async cancel(
    userId: string,
    reservationId: string,
  ): Promise<{ reservationId: string; status: ReservationStatus }> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { payment: true },
    });
    if (!reservation) throw reservationNotFoundError();
    if (reservation.userId !== userId) throw notOwnerError();
    if (!reservation.payment) {
      // Invariant violation, not a normal error path — every Reservation
      // is created with a Payment row in the same transaction.
      throw new Error(
        `Reservation ${reservationId} has no Payment row (data invariant violated)`,
      );
    }
    const payment = reservation.payment;
    const now = new Date();

    // [I2 fix] The refund-or-not decision below is derived from the
    // transition that actually matches INSIDE this transaction — trying
    // PENDING_PAYMENT first, then CONFIRMED — never from a status read
    // BEFORE the transaction (the `reservation.status` above is only used
    // for the not-found/not-owner checks). A webhook can confirm+pay this
    // reservation in the window between that earlier read and this
    // transaction committing; deciding "no refund" from the stale read
    // would silently keep the customer's money with the reservation
    // cancelled and nothing to show for it. Whichever compound-WHERE
    // update actually matches a row is the only trustworthy source for
    // "what was this reservation's status at the moment we cancelled it".
    const wasConfirmed = await this.prisma.$transaction(async (tx) => {
      // [C1 fix] Terminate a still-live Payment intent in the SAME
      // transaction as the reservation cancel, BEFORE touching the
      // reservation (lock order: Payment then Reservation, matching
      // payment-settle.service.ts). Without this, a Payment left INTENT
      // after a PENDING_PAYMENT cancel can still be settled PAID by a
      // later webhook/sweeper, charging the customer for a reservation
      // that no longer exists. Speculative and safe to run before knowing
      // whether the cancel itself will succeed: if the reservation turns
      // out not to be cancellable below, the whole transaction (including
      // this write) rolls back.
      await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ["INTENT", "PROCESSING"] } },
        data: { status: "FAILED" },
      });

      let matchedFrom: ReservationStatus | undefined;
      for (const fromStatus of CANCELLABLE_FROM) {
        const result = await tx.reservation.updateMany({
          where: {
            id: reservationId,
            status: fromStatus,
            cancelDeadlineAt: { gt: now },
          },
          data: { status: "CANCELLED_BY_USER" },
        });
        if (result.count > 0) {
          matchedFrom = fromStatus;
          break;
        }
      }
      if (!matchedFrom) {
        throw notCancellableError();
      }

      await this.offerStock.release(tx, reservation.offerId, reservation.qty);

      return matchedFrom === "CONFIRMED";
    });

    if (wasConfirmed) {
      await this.refundForCancellation(
        payment.id,
        payment.merchantOid,
        payment.amountCents,
        reservationId,
        "USER_CANCEL",
        "CONSUMER",
      );
    }

    return { reservationId, status: "CANCELLED_BY_USER" };
  }

  /**
   * Refund call for a cancel of a CONFIRMED (already-paid) reservation.
   * Deliberately OUTSIDE the cancel transaction above — provider I/O never
   * runs inside a $transaction. [I1 fix] The try/catch below is split into
   * two DISTINCT failure modes that must never be recorded the same way:
   *   - The provider call itself throws: no money moved. Safe to record a
   *     FAILED Refund row — a manual retry is exactly the right recovery.
   *   - The provider call SUCCEEDS (we hold a real refundRef) but the
   *     bookkeeping write that follows it throws (a DB blip): money DID
   *     move at the provider. Recording that as FAILED would read as
   *     "never happened" and invite a manual retry that double-refunds
   *     the customer at the provider. The fallback path below always
   *     carries the real refundRef and a status that reads as "sent,
   *     needs reconciliation" (SENT), never FAILED.
   *
   * [Task 5] Generalized from the original single-caller `refundOnCancel`
   * (reason/requestedByType hardcoded to USER_CANCEL/CONSUMER) so
   * cancelAllForOffer's merchant-cancel / suspend kill-switch fan-out
   * reuses the EXACT same bookkeeping instead of duplicating it — the
   * whole point of the Task 4 finding this ports forward. Returns a
   * result instead of void (still never throws) so a batch caller
   * (refundMany) can collect per-item outcomes without a failure
   * anywhere aborting the batch.
   */
  private async refundForCancellation(
    paymentId: string,
    merchantOid: string,
    amountCents: number,
    reservationId: string,
    reason: RefundReason,
    requestedByType: string,
  ): Promise<{ ok: boolean; refundRef?: string; error?: string }> {
    let refundRef: string;
    try {
      const refund = await this.facade.refund(merchantOid, amountCents);
      refundRef = refund.refundRef;
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(
        `CRITICAL: provider refund call failed for reservation ${reservationId} (merchantOid=${merchantOid}): ${message}`,
      );
      await this.prisma.refund
        .create({
          data: {
            paymentId,
            amountCents,
            reason,
            status: "FAILED",
            requestedByType,
          },
        })
        .catch(() => undefined);
      return { ok: false, error: message };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.refund.create({
          data: {
            paymentId,
            amountCents,
            reason,
            pspRefundId: refundRef,
            status: "DONE",
            requestedByType,
          },
        });
        await tx.payment.updateMany({
          where: { id: paymentId, status: "PAID" },
          data: { status: "REFUNDED" },
        });
      });
      return { ok: true, refundRef };
    } catch (err) {
      // [I1] Money already moved at the provider (refundRef is real) —
      // this is a bookkeeping failure, not a refund failure. Never write
      // FAILED here; that would tell ops "retry the refund" and cause a
      // double refund. SENT communicates "provider confirmed, our books
      // aren't caught up yet" for manual reconciliation instead. Reported
      // as ok:true (the refund itself genuinely succeeded) — the message
      // is still logged CRITICAL for ops to find.
      const message = (err as Error).message;
      this.logger.error(
        `CRITICAL: provider refund SUCCEEDED (refundRef=${refundRef}) for reservation ${reservationId} but recording it failed — money moved, bookkeeping incomplete; needs manual reconciliation, NOT a retry: ${message}`,
      );
      await this.prisma.refund
        .create({
          data: {
            paymentId,
            amountCents,
            reason,
            pspRefundId: refundRef,
            status: "SENT",
            requestedByType,
          },
        })
        .catch((inner) => {
          this.logger.error(
            `CRITICAL: also failed to record the fallback Refund row for reservation ${reservationId} (refundRef=${refundRef}) — recording refundRef here for manual recovery: ${(inner as Error).message}`,
          );
        });
      await this.prisma.payment
        .updateMany({
          where: { id: paymentId, status: "PAID" },
          data: { status: "REFUNDED" },
        })
        .catch(() => undefined);
      return { ok: true, refundRef };
    }
  }

  /**
   * [Task 5] Transactional core of the merchant-cancel (offers.service.ts)
   * / suspend kill-switch (merchants.service.ts) reservation fan-out —
   * pure DB writes against the `tx` the CALLER is already inside (tx-first
   * parameter, matching OfferStockService.claim/release's own convention),
   * so the caller composes this with the DailyOffer status transition and
   * the offer.cancelled.v1 outbox insert in ONE transaction: all three
   * commit or roll back together, and an offer that turns out not to be in
   * a cancellable status (checked by the caller's own guarded update
   * BEFORE calling this) never reaches this method at all. NO provider I/O
   * here — see refundMany() below for the outside-tx refund calls this
   * feeds.
   *
   * Every reservation currently PENDING_PAYMENT or CONFIRMED for this
   * offer is a candidate; each one's actual transition is its own
   * compound-WHERE guarded update (the same pattern as
   * cancel()/expireAndRelease()), so a concurrent webhook/sweeper settling
   * one of these mid-fan-out loses the race cleanly — the guard simply
   * won't match, that reservation is left for whatever DID win to have
   * already handled its own stock release, and it's never double-released
   * here.
   *
   * No `reason` parameter here (unlike refundMany, right below): the
   * reservation-level transition is always CONFIRMED -> CANCELLED_BY_MERCHANT
   * regardless of whether a merchant's own cancel or an admin-triggered
   * suspend caused it — the schema has no separate CANCELLED_BY_ADMIN
   * status, so there is nothing for this method's own writes to branch on.
   * `reason` only becomes meaningful once real money moves (the Refund
   * row's RefundReason), which is exactly refundMany's job.
   */
  async cancelAllForOffer(
    tx: Prisma.TransactionClient,
    offerId: string,
  ): Promise<OfferCancelFanOutResult> {
    const candidates = await tx.reservation.findMany({
      where: { offerId, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
      include: { payment: true },
    });

    let expiredCount = 0;
    const toRefund: OfferCancelFanOutResult["toRefund"] = [];

    for (const reservation of candidates) {
      if (!reservation.payment) {
        // Invariant violation (every Reservation is created with a
        // Payment row in the same transaction) — never expected in
        // practice; skip rather than let one bad row abort the whole
        // fan-out for every other reservation on this offer.
        this.logger.error(
          `Reservation ${reservation.id} has no Payment row during offer cancel fan-out for offer ${offerId} (data invariant violated) — skipping.`,
        );
        continue;
      }
      const payment = reservation.payment;

      // Terminate a still-live intent first (lock order Payment then
      // Reservation, matching cancel()/expireAndRelease() elsewhere in
      // this file).
      await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ["INTENT", "PROCESSING"] } },
        data: { status: "FAILED" },
      });

      if (reservation.status === "PENDING_PAYMENT") {
        const updated = await tx.reservation.updateMany({
          where: { id: reservation.id, status: { in: EXPIRABLE_FROM } },
          data: { status: "EXPIRED" },
        });
        if (updated.count === 0) continue; // lost a race — no stock to release
        await this.offerStock.release(tx, offerId, reservation.qty);
        expiredCount++;
        continue;
      }

      // CONFIRMED -> CANCELLED_BY_MERCHANT (the schema's only allowed
      // target from CONFIRMED that a merchant-side action reaches, per
      // reservation-transitions.ts — used for both reasons this method
      // accepts, MERCHANT_CANCEL and ADMIN, since the reservation-level
      // transition itself doesn't distinguish who triggered it).
      const updated = await tx.reservation.updateMany({
        where: {
          id: reservation.id,
          status: { in: CANCELLED_BY_MERCHANT_FROM },
        },
        data: { status: "CANCELLED_BY_MERCHANT" },
      });
      if (updated.count === 0) continue;
      await this.offerStock.release(tx, offerId, reservation.qty);
      toRefund.push({
        reservationId: reservation.id,
        paymentId: payment.id,
        merchantOid: payment.merchantOid,
        amountCents: payment.amountCents,
      });
    }

    return { expiredCount, cancelledCount: toRefund.length, toRefund };
  }

  /**
   * [Task 5] Provider refund calls for a batch of just-cancelled CONFIRMED
   * reservations (cancelAllForOffer's `toRefund` list), run strictly
   * OUTSIDE any transaction — same rule as refundForCancellation, which
   * this loops. A single failed call never aborts the batch: every
   * outcome is collected and returned so the caller can report
   * per-reservation success/failure instead of losing the other refunds
   * to one failure.
   */
  async refundMany(
    items: OfferCancelFanOutResult["toRefund"],
    reason: OfferCancelReason,
  ): Promise<RefundBatchOutcome[]> {
    const requestedByType = reason === "ADMIN" ? "ADMIN" : "MERCHANT";
    const results: RefundBatchOutcome[] = [];
    for (const item of items) {
      const outcome = await this.refundForCancellation(
        item.paymentId,
        item.merchantOid,
        item.amountCents,
        item.reservationId,
        reason,
        requestedByType,
      );
      results.push({ reservationId: item.reservationId, ...outcome });
    }
    return results;
  }

  async redeem(
    merchantUserId: string,
    merchantId: string,
    reservationId: string,
  ): Promise<{ reservationId: string; status: "REDEEMED"; redeemedAt: Date }> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        store: true,
        // [Task 9] bagTemplate's original-value range is needed for the
        // reservation.redeemed.impact.v1 payload below — fetched here
        // (piggybacking on this same read) rather than a second query.
        offer: { include: { bagTemplate: true } },
      },
    });
    if (!reservation) throw reservationNotFoundError();
    if (reservation.store.merchantId !== merchantId) {
      throw new ForbiddenException({
        statusCode: 403,
        errorCode: "FORBIDDEN",
        message: "This reservation does not belong to your store.",
      });
    }

    if (reservation.status === "REDEEMED") {
      // Idempotent replay of an already-completed redeem.
      return {
        reservationId,
        status: "REDEEMED",
        redeemedAt: reservation.redeemedAt!,
      };
    }

    const now = new Date();
    if (
      reservation.status !== "CONFIRMED" ||
      now < reservation.offer.pickupStartAt ||
      now > reservation.offer.pickupEndAt
    ) {
      throw notRedeemableError();
    }

    const attemptedAt = new Date();
    const redeemedAt = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.reservation.updateMany({
        where: { id: reservationId, status: { in: REDEEMABLE_FROM } },
        data: {
          status: "REDEEMED",
          redeemedAt: attemptedAt,
          redeemedByMerchantUserId: merchantUserId,
        },
      });
      if (updated.count === 0) {
        // Lost the race to a concurrent redeem for the SAME reservation —
        // Postgres re-evaluated our WHERE against whatever the winner just
        // committed. If the winner also redeemed it, this is the
        // idempotent case: same success, no double increment. Any other
        // resulting status is a genuine conflict.
        const current = await tx.reservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
        if (current.status !== "REDEEMED") {
          throw notRedeemableError();
        }
        return current.redeemedAt!;
      }

      await tx.dailyOffer.update({
        where: { id: reservation.offerId },
        data: { qtyRedeemed: { increment: reservation.qty } },
      });

      // [Task 7] Rating-invite, delayed +2h via scheduledFor — the worker
      // skips this row entirely until then (outbox-worker.service.ts's
      // claim query). Only reached on the WINNING branch above (count>0),
      // never on the idempotent-replay branch, so a race between two
      // redeem() calls for the same reservation still only ever queues
      // this once.
      await this.outbox.publish(tx, {
        type: OUTBOX_EVENT_TYPES.RESERVATION_REDEEMED_V1,
        payload: {
          reservationId,
          userId: reservation.userId,
          storeId: reservation.storeId,
        },
        idempotencyKey: `reservation-redeemed:${reservationId}`,
        scheduledFor: new Date(attemptedAt.getTime() + RATING_INVITE_DELAY_MS),
      });

      // [Task 9] The impact-ledger leg — no scheduledFor (recorded
      // immediately, unlike the +2h rating invite above). Split into its
      // own event/handler rather than piggybacking on
      // ReservationRedeemedHandler — see event-types.ts's doc comment.
      await this.outbox.publish(tx, {
        type: OUTBOX_EVENT_TYPES.RESERVATION_REDEEMED_IMPACT_V1,
        payload: {
          reservationId,
          userId: reservation.userId,
          storeId: reservation.storeId,
          qty: reservation.qty,
          totalCents: reservation.totalCents,
          originalValueCentsMin:
            reservation.offer.bagTemplate.originalValueCentsMin,
          originalValueCentsMax:
            reservation.offer.bagTemplate.originalValueCentsMax,
        },
        idempotencyKey: `reservation-redeemed-impact:${reservationId}`,
      });

      return attemptedAt;
    });

    return { reservationId, status: "REDEEMED", redeemedAt };
  }

  async listMine(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<ListReservationsResult> {
    const offset = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      // Prisma's query builder has no way to express "order by a custom
      // priority derived from an enum column" — active reservations
      // (PENDING_PAYMENT, CONFIRMED) first, everything terminal after —
      // so this is raw SQL, same rationale as OfferStockService. The SQL
      // `LIMIT` KEYWORD below is unrelated to the `pageSize` parameter
      // name — it's just what Postgres calls "how many rows," same as
      // every other paginated query in this codebase already uses
      // `pageSize` for its OWN param name (this endpoint used to be the
      // one exception, calling it `limit` — [Consistency fix] renamed to
      // match every other paginated list's envelope field).
      this.prisma.$queryRaw<Reservation[]>`
        SELECT * FROM "reservations"
        WHERE "userId" = ${userId}
        ORDER BY CASE "status"
          WHEN 'PENDING_PAYMENT' THEN 0
          WHEN 'CONFIRMED' THEN 1
          ELSE 2
        END ASC, "createdAt" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      this.prisma.reservation.count({ where: { userId } }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * [Merchant pickup list] The "Bugün" screen's pickup list — what a shop
   * owner watches while handing bags over during the pickup window.
   * Scoped to the caller's own merchantId via `store: { merchantId }`, a
   * Prisma relation filter that compiles to a real SQL JOIN/WHERE — the
   * scoping happens IN the query Postgres runs, not as a filter over
   * already-fetched rows, so a mis-scoped query is structurally
   * impossible to silently widen later (there is no unscoped result set
   * this ever holds in memory). `date` defaults to today's Europe/
   * Istanbul calendar day and filters on the OFFER's own offerDate (the
   * reservation itself has no pickup-window columns — those live on
   * DailyOffer) — same "today" default offers.service.ts's listMine
   * already uses for the equivalent merchant-facing offers list.
   */
  async listForMerchant(
    merchantId: string,
    filters: ListReservationsForMerchantFilters,
  ): Promise<ListReservationsForMerchantResult> {
    const dateKey = filters.date ?? istanbulDateKey(new Date());
    const where: Prisma.ReservationWhereInput = {
      store: { merchantId },
      offer: { offerDate: offerDateToDbDate(dateKey) },
      ...(filters.storeId && { storeId: filters.storeId }),
      ...(filters.offerId && { offerId: filters.offerId }),
      ...(filters.status &&
        filters.status.length > 0 && { status: { in: filters.status } }),
    };

    const skip = (filters.page - 1) * filters.pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        // Soonest pickup first — what a merchant scanning the list while
        // handing out bags actually wants to see next.
        orderBy: [{ offer: { pickupStartAt: "asc" } }, { createdAt: "asc" }],
        skip,
        take: filters.pageSize,
        select: {
          id: true,
          storeId: true,
          offerId: true,
          code: true,
          qty: true,
          status: true,
          redeemedAt: true,
          offer: { select: { pickupStartAt: true, pickupEndAt: true } },
          user: { select: { name: true } },
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    const items: ReservationForMerchantItem[] = rows.map((r) => ({
      id: r.id,
      storeId: r.storeId,
      offerId: r.offerId,
      code: r.code,
      qty: r.qty,
      status: r.status,
      pickupStartAt: r.offer.pickupStartAt,
      pickupEndAt: r.offer.pickupEndAt,
      redeemedAt: r.redeemedAt,
      customerFirstName: firstNameOnly(r.user.name),
    }));

    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }
}
