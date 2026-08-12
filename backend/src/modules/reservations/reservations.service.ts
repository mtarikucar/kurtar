import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Reservation, ReservationStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { toPrismaPaymentProvider } from "../payments-core/payment-provider.mapping";
import { OfferStockService } from "./offer-stock.service";
import { generateReservationCode } from "./reservation-code.util";
import { generateMerchantOid } from "./merchant-oid.util";
import { allowedFromStatusesFor } from "./reservation-transitions";

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
  limit: number;
}

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
      await this.refundOnCancel(
        payment.id,
        payment.merchantOid,
        payment.amountCents,
        reservationId,
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
   */
  private async refundOnCancel(
    paymentId: string,
    merchantOid: string,
    amountCents: number,
    reservationId: string,
  ): Promise<void> {
    let refundRef: string;
    try {
      const refund = await this.facade.refund(merchantOid, amountCents);
      refundRef = refund.refundRef;
    } catch (err) {
      this.logger.error(
        `CRITICAL: provider refund call failed for reservation ${reservationId} (merchantOid=${merchantOid}): ${(err as Error).message}`,
      );
      await this.prisma.refund
        .create({
          data: {
            paymentId,
            amountCents,
            reason: "USER_CANCEL",
            status: "FAILED",
            requestedByType: "CONSUMER",
          },
        })
        .catch(() => undefined);
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.refund.create({
          data: {
            paymentId,
            amountCents,
            reason: "USER_CANCEL",
            pspRefundId: refundRef,
            status: "DONE",
            requestedByType: "CONSUMER",
          },
        });
        await tx.payment.updateMany({
          where: { id: paymentId, status: "PAID" },
          data: { status: "REFUNDED" },
        });
      });
    } catch (err) {
      // [I1] Money already moved at the provider (refundRef is real) —
      // this is a bookkeeping failure, not a refund failure. Never write
      // FAILED here; that would tell ops "retry the refund" and cause a
      // double refund. SENT communicates "provider confirmed, our books
      // aren't caught up yet" for manual reconciliation instead.
      this.logger.error(
        `CRITICAL: provider refund SUCCEEDED (refundRef=${refundRef}) for reservation ${reservationId} but recording it failed — money moved, bookkeeping incomplete; needs manual reconciliation, NOT a retry: ${(err as Error).message}`,
      );
      await this.prisma.refund
        .create({
          data: {
            paymentId,
            amountCents,
            reason: "USER_CANCEL",
            pspRefundId: refundRef,
            status: "SENT",
            requestedByType: "CONSUMER",
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
    }
  }

  async redeem(
    merchantUserId: string,
    merchantId: string,
    reservationId: string,
  ): Promise<{ reservationId: string; status: "REDEEMED"; redeemedAt: Date }> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { store: true, offer: true },
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
      return attemptedAt;
    });

    return { reservationId, status: "REDEEMED", redeemedAt };
  }

  async listMine(
    userId: string,
    page: number,
    limit: number,
  ): Promise<ListReservationsResult> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      // Prisma's query builder has no way to express "order by a custom
      // priority derived from an enum column" — active reservations
      // (PENDING_PAYMENT, CONFIRMED) first, everything terminal after —
      // so this is raw SQL, same rationale as OfferStockService.
      this.prisma.$queryRaw<Reservation[]>`
        SELECT * FROM "reservations"
        WHERE "userId" = ${userId}
        ORDER BY CASE "status"
          WHEN 'PENDING_PAYMENT' THEN 0
          WHEN 'CONFIRMED' THEN 1
          ELSE 2
        END ASC, "createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.reservation.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }
}
