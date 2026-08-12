import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, Reservation, ReservationStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { toPrismaPaymentProvider } from "../payments-core/payment-provider.mapping";
import { OfferStockService } from "./offer-stock.service";
import { generateReservationCode } from "./reservation-code.util";
import { generateMerchantOid } from "./merchant-oid.util";

const MAX_CODE_ATTEMPTS = 5;
const CANCEL_DEADLINE_BEFORE_PICKUP_MS = 2 * 60 * 60 * 1000; // 2h

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

/**
 * The reservations state machine, on top of the raw atomic stock
 * primitives in OfferStockService. Every write here that changes
 * Reservation.status goes through a compound-WHERE guarded update (never
 * a plain findUnique-then-update) so a concurrent transition — a redeem
 * racing another redeem, a webhook racing the sweeper's expiry — resolves
 * to exactly one effect. See payment-settle.service.ts for the
 * webhook/sweeper side of the same state machine (PENDING_PAYMENT ->
 * CONFIRMED / EXPIRED); this file owns everything else.
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
    const committed = await this.prisma.$transaction(
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

        // Atomic claim FIRST: whether this succeeds is independent of the
        // `offer` row we just read above (the raw UPDATE's WHERE clause
        // re-checks status/qty against the live row, not our stale read) —
        // see OfferStockService.claim's doc comment for why that's safe
        // under concurrency.
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

        const reservation = await this.createReservationWithUniqueCode(tx, {
          userId,
          offerId,
          storeId: offer.storeId,
          qty,
          unitPriceCents,
          totalCents,
          cancelDeadlineAt,
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
   * COMPENSATION for a createIntent failure discovered after the create
   * transaction already committed. Unwinds all three effects in a second
   * transaction: Payment -> FAILED, Reservation -> EXPIRED, stock
   * released back to the offer (flipping SOLD_OUT -> PUBLISHED if that
   * opens up room). Guarded exactly like the webhook/sweeper paths
   * (compound WHERE on the still-INTENT/PENDING_PAYMENT state) so this
   * can never double-effect against a concurrent webhook that — against
   * all odds — settled the SAME merchantOid in the same instant (e.g. a
   * provider that accepted the charge but the HTTP response back to us
   * was what failed).
   */
  private async compensateFailedIntent(
    committed: CommittedReservation,
    cause: Error,
  ): Promise<void> {
    this.logger.error(
      `createIntent failed for merchantOid=${committed.merchantOid}, compensating: ${cause.message}`,
    );
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { merchantOid: committed.merchantOid, status: "INTENT" },
        data: { status: "FAILED" },
      });
      if (updated.count === 0) {
        // A concurrent webhook/sweeper already moved this Payment out of
        // INTENT — nothing left to compensate.
        return;
      }
      await tx.reservation.updateMany({
        where: { id: committed.reservationId, status: "PENDING_PAYMENT" },
        data: { status: "EXPIRED" },
      });
      await this.offerStock.release(tx, committed.offerId, committed.qty);
    });
  }

  private async createReservationWithUniqueCode(
    tx: Prisma.TransactionClient,
    data: {
      userId: string;
      offerId: string;
      storeId: string;
      qty: number;
      unitPriceCents: number;
      totalCents: number;
      cancelDeadlineAt: Date;
    },
  ): Promise<Reservation> {
    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateReservationCode();
      try {
        return await tx.reservation.create({ data: { ...data, code } });
      } catch (err) {
        if (
          isUniqueConstraintViolation(err, "code") &&
          attempt < MAX_CODE_ATTEMPTS
        ) {
          continue;
        }
        throw err;
      }
    }
    /* istanbul ignore next -- unreachable: the loop above always returns or throws */
    throw new Error("Failed to generate a unique reservation code");
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
    const priorStatus = reservation.status;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.reservation.updateMany({
        where: {
          id: reservationId,
          status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
          cancelDeadlineAt: { gt: now },
        },
        data: { status: "CANCELLED_BY_USER" },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          statusCode: 409,
          errorCode: "RESERVATION_NOT_CANCELLABLE",
          message: "This reservation can no longer be cancelled.",
        });
      }
      await this.offerStock.release(tx, reservation.offerId, reservation.qty);
    });

    if (priorStatus === "CONFIRMED") {
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
   * runs inside a $transaction — and deliberately best-effort: the
   * cancellation + stock release already committed and stand regardless
   * of whether the refund call itself succeeds. A refund failure is an
   * operational incident (logged + recorded as a FAILED Refund row for
   * ops to retry manually); there is no retry queue yet (out of scope for
   * this task), so this is a documented gap, not a silent one.
   */
  private async refundOnCancel(
    paymentId: string,
    merchantOid: string,
    amountCents: number,
    reservationId: string,
  ): Promise<void> {
    try {
      const refund = await this.facade.refund(merchantOid, amountCents);
      await this.prisma.$transaction(async (tx) => {
        await tx.refund.create({
          data: {
            paymentId,
            amountCents,
            reason: "USER_CANCEL",
            pspRefundId: refund.refundRef,
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
      this.logger.error(
        `CRITICAL: refund failed for reservation ${reservationId} (merchantOid=${merchantOid}): ${(err as Error).message}`,
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
      throw new ConflictException({
        statusCode: 409,
        errorCode: "RESERVATION_NOT_REDEEMABLE",
        message: "This reservation cannot be redeemed right now.",
      });
    }

    const attemptedAt = new Date();
    const redeemedAt = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.reservation.updateMany({
        where: { id: reservationId, status: "CONFIRMED" },
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
          throw new ConflictException({
            statusCode: 409,
            errorCode: "RESERVATION_NOT_REDEEMABLE",
            message: "This reservation cannot be redeemed right now.",
          });
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
