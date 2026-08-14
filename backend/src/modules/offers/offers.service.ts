import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { DailyOffer } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import {
  ReservationsService,
  OfferCancelReason,
  RefundBatchOutcome,
} from "../reservations/reservations.service";
import { CreateOfferDto } from "./dto/create-offer.dto";
import { ScheduleOfferDto } from "./dto/schedule-offer.dto";
import { validateOfferWindow } from "./offer-window.rules";
import {
  istanbulDateKey,
  offerDateToDbDate,
} from "../../common/utils/istanbul-date.util";
import { allowedFromStatusesFor } from "./offer-transitions";

export interface OfferCancelResult {
  offerId: string;
  status: "CANCELLED";
  expiredCount: number;
  cancelledCount: number;
  refundResults: RefundBatchOutcome[];
}

function offerNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "OFFER_NOT_FOUND",
    message: "Offer not found.",
  });
}

function bagTemplateNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "BAG_TEMPLATE_NOT_FOUND",
    message: "Bag template not found.",
  });
}

function notStoreOwnerError() {
  return new ForbiddenException({
    statusCode: 403,
    errorCode: "FORBIDDEN",
    message: "This store does not belong to you.",
  });
}

function bagTemplateInactiveError() {
  return new ConflictException({
    statusCode: 409,
    errorCode: "BAG_TEMPLATE_INACTIVE",
    message:
      "This bag template has been deactivated and can no longer be used for new offers.",
  });
}

/**
 * DailyOffer lifecycle (§3 of the brief) — every status change is a
 * compound-WHERE guarded update deriving its "from" list from
 * offer-transitions.ts's allowedFromStatusesFor, matching
 * reservations/merchants' own pattern. cancel() is the one method other
 * modules reuse: OffersModule's own controller calls it store-owner-scoped
 * (cancel()), and modules/merchants' suspend kill-switch calls
 * cancelAllActiveForMerchant() — both funnel into the SAME private
 * cancelOne(), which is the only place that touches
 * ReservationsService.cancelAllForOffer/refundMany, so the fan-out logic
 * is never duplicated.
 */
@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
  ) {}

  private async assertOwnedOffer(
    merchantId: string,
    offerId: string,
  ): Promise<DailyOffer> {
    const offer = await this.prisma.dailyOffer.findUnique({
      where: { id: offerId },
      include: { store: true },
    });
    if (!offer) throw offerNotFoundError();
    if (offer.store.merchantId !== merchantId) throw notStoreOwnerError();
    return offer;
  }

  async create(merchantId: string, dto: CreateOfferDto) {
    const bagTemplate = await this.prisma.bagTemplate.findUnique({
      where: { id: dto.bagTemplateId },
      include: { store: true },
    });
    if (!bagTemplate) throw bagTemplateNotFoundError();
    if (bagTemplate.store.merchantId !== merchantId) throw notStoreOwnerError();
    if (!bagTemplate.active) throw bagTemplateInactiveError();

    const pickupStartAt = new Date(dto.pickupStartAt);
    const pickupEndAt = new Date(dto.pickupEndAt);
    validateOfferWindow({
      offerDate: dto.offerDate,
      pickupStartAt,
      pickupEndAt,
    });

    try {
      return await this.prisma.dailyOffer.create({
        data: {
          bagTemplateId: dto.bagTemplateId,
          storeId: bagTemplate.storeId,
          offerDate: offerDateToDbDate(dto.offerDate),
          qtyTotal: dto.qtyTotal,
          pickupStartAt,
          pickupEndAt,
        },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictException({
          statusCode: 409,
          errorCode: "OFFER_DATE_ALREADY_EXISTS",
          message:
            "An offer for this bag template already exists on this date.",
        });
      }
      throw err;
    }
  }

  async publish(
    merchantId: string,
    offerId: string,
  ): Promise<{ offerId: string; status: "PUBLISHED"; publishedAt: Date }> {
    await this.assertOwnedOffer(merchantId, offerId);
    return this.publishOffer(offerId);
  }

  /**
   * Shared core of the manual publish endpoint and publishDueScheduled's
   * cron loop — deliberately NOT ownership-scoped (the cron processes
   * every merchant's due offers), so ownership is the CALLER's
   * responsibility (publish() checks it; the cron intentionally doesn't).
   * The "pickupEndAt still future" guard is folded directly into the
   * updateMany's WHERE clause (not a separate pre-check) so there's no
   * TOCTOU window between reading the offer and flipping its status; on a
   * miss, a cheap re-read distinguishes "wrong status" from "window
   * passed" purely for a clearer error message.
   */
  private async publishOffer(
    offerId: string,
  ): Promise<{ offerId: string; status: "PUBLISHED"; publishedAt: Date }> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dailyOffer.updateMany({
        where: {
          id: offerId,
          status: { in: allowedFromStatusesFor("PUBLISHED") },
          pickupEndAt: { gt: now },
        },
        data: { status: "PUBLISHED", publishedAt: now },
      });

      if (updated.count === 0) {
        const current = await tx.dailyOffer.findUnique({
          where: { id: offerId },
        });
        if (!current) throw offerNotFoundError();
        if (current.pickupEndAt <= now) {
          throw new ConflictException({
            statusCode: 409,
            errorCode: "OFFER_PICKUP_WINDOW_PASSED",
            message: "This offer's pickup window has already passed.",
          });
        }
        throw new ConflictException({
          statusCode: 409,
          errorCode: "OFFER_NOT_PUBLISHABLE",
          message: `Offer is in ${current.status}, which cannot be published.`,
        });
      }

      const offer = await tx.dailyOffer.findUniqueOrThrow({
        where: { id: offerId },
      });
      // No jitter yet — jitter is a push-fan-out concern (spreading
      // notification bursts), which lands with the notifications worker,
      // not this task.
      await tx.outboxEvent.create({
        data: {
          type: "offer.published.v1",
          payload: {
            offerId,
            storeId: offer.storeId,
            bagTemplateId: offer.bagTemplateId,
            publishedAt: now.toISOString(),
          },
          idempotencyKey: `offer-published:${offerId}`,
        },
      });

      return { offerId, status: "PUBLISHED" as const, publishedAt: now };
    });
  }

  /**
   * Called every minute by OffersPublishSchedulerService. Best-effort,
   * per-offer: one offer failing to publish is logged and skipped, never
   * aborting the rest of the sweep — same philosophy as
   * PaymentsSweeperService.sweepStaleIntents. One failure mode gets more
   * than a skip, though: an offer whose pickup window had ALREADY passed
   * by the time its publishAt arrived (OFFER_PICKUP_WINDOW_PASSED) stays
   * SCHEDULED forever if left alone — this same query re-selects it every
   * single minute, forever, since nothing about "skip and log" ever
   * changes its status. That specific case gets actively terminalized to
   * CANCELLED (a guarded transition already valid from SCHEDULED per
   * offer-transitions.ts — no map change needed) so it drops out of this
   * query for good. No reservation fan-out is needed for the
   * terminalization: a SCHEDULED offer was never PUBLISHED, and
   * OfferStockService.claim only matches PUBLISHED offers, so it is
   * IMPOSSIBLE for one to have any reservations against it.
   */
  async publishDueScheduled(now: Date = new Date()): Promise<{
    publishedCount: number;
    failedCount: number;
    expiredCount: number;
  }> {
    const due = await this.prisma.dailyOffer.findMany({
      where: { status: "SCHEDULED", publishAt: { lte: now } },
      select: { id: true },
    });

    let publishedCount = 0;
    let failedCount = 0;
    let expiredCount = 0;
    for (const { id } of due) {
      try {
        await this.publishOffer(id);
        publishedCount++;
      } catch (err) {
        const errorCode =
          err instanceof ConflictException
            ? (err.getResponse() as { errorCode?: string } | string)
            : undefined;
        const code =
          typeof errorCode === "object" ? errorCode.errorCode : undefined;

        if (code === "OFFER_PICKUP_WINDOW_PASSED") {
          const terminalized = await this.terminalizeExpiredScheduled(id);
          if (terminalized) {
            expiredCount++;
            this.logger.warn(
              `Publish-scheduler: offer ${id}'s pickup window had already passed before it could be published — terminalized to CANCELLED instead of retrying forever.`,
            );
            continue;
          }
        }

        failedCount++;
        this.logger.warn(
          `Publish-scheduler: offer ${id} failed to publish: ${(err as Error).message}`,
        );
      }
    }
    return { publishedCount, failedCount, expiredCount };
  }

  /**
   * Guarded SCHEDULED -> CANCELLED transition for an offer whose window
   * expired before it ever got published. No offer.cancelled.v1 outbox
   * row here: that event exists for cancellations that might have
   * affected live reservations/refunds (see cancelOne below); this one
   * provably never had any, so there is nothing downstream to reconcile.
   */
  private async terminalizeExpiredScheduled(offerId: string): Promise<boolean> {
    const updated = await this.prisma.dailyOffer.updateMany({
      where: {
        id: offerId,
        status: { in: allowedFromStatusesFor("CANCELLED") },
      },
      data: { status: "CANCELLED" },
    });
    return updated.count > 0;
  }

  async schedule(merchantId: string, offerId: string, dto: ScheduleOfferDto) {
    await this.assertOwnedOffer(merchantId, offerId);

    const publishAt = new Date(dto.publishAt);
    if (publishAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: "OFFER_SCHEDULE_NOT_FUTURE",
        message: "publishAt must be in the future.",
      });
    }

    const updated = await this.prisma.dailyOffer.updateMany({
      where: {
        id: offerId,
        status: { in: allowedFromStatusesFor("SCHEDULED") },
      },
      data: { status: "SCHEDULED", publishAt },
    });
    if (updated.count === 0) {
      throw new ConflictException({
        statusCode: 409,
        errorCode: "OFFER_NOT_SCHEDULABLE",
        message: "Offer cannot be scheduled from its current status.",
      });
    }

    return { offerId, status: "SCHEDULED" as const, publishAt };
  }

  async close(merchantId: string, offerId: string) {
    await this.assertOwnedOffer(merchantId, offerId);

    const updated = await this.prisma.dailyOffer.updateMany({
      where: { id: offerId, status: { in: allowedFromStatusesFor("CLOSED") } },
      data: { status: "CLOSED" },
    });
    if (updated.count === 0) {
      throw new ConflictException({
        statusCode: 409,
        errorCode: "OFFER_NOT_CLOSEABLE",
        message: "Offer cannot be closed from its current status.",
      });
    }

    return { offerId, status: "CLOSED" as const };
  }

  /** Merchant-facing cancel — ownership-checked, then MERCHANT_CANCEL. */
  async cancel(
    merchantId: string,
    offerId: string,
  ): Promise<OfferCancelResult> {
    const offer = await this.assertOwnedOffer(merchantId, offerId);
    return this.cancelOne(offer.id, "MERCHANT_CANCEL");
  }

  /**
   * Admin suspend kill-switch entry point (called from
   * modules/merchants/merchants.service.ts's adminSuspend, satisfying the
   * brief's "suspend CANCELS all the merchant's active offers via the
   * offers service"). Finds every offer across the merchant's stores that
   * is currently in a cancellable status (offer-transitions.ts's own
   * allowedFromStatusesFor("CANCELLED") — the exact same set the manual
   * cancel endpoint's guard uses, so "active" here means precisely what it
   * means everywhere else in this module) and cancels each one through the
   * SAME cancelOne() the merchant-facing endpoint uses. One offer failing
   * never aborts the rest — failures are collected and returned/logged,
   * mirroring cancelAllForOffer's own per-reservation collect-and-report.
   */
  async cancelAllActiveForMerchant(
    merchantId: string,
    reason: OfferCancelReason,
  ): Promise<{
    offersCancelled: number;
    failures: Array<{ offerId: string; error: string }>;
  }> {
    const offers = await this.prisma.dailyOffer.findMany({
      where: {
        status: { in: allowedFromStatusesFor("CANCELLED") },
        store: { merchantId },
      },
      select: { id: true },
    });

    let offersCancelled = 0;
    const failures: Array<{ offerId: string; error: string }> = [];
    for (const { id } of offers) {
      try {
        await this.cancelOne(id, reason);
        offersCancelled++;
      } catch (err) {
        const message = (err as Error).message;
        failures.push({ offerId: id, error: message });
        this.logger.error(
          `Suspend kill-switch: failed to cancel offer ${id} for merchant ${merchantId}: ${message}`,
        );
      }
    }
    return { offersCancelled, failures };
  }

  /**
   * The composite "cancel" operation both cancel() and
   * cancelAllActiveForMerchant() funnel into: guarded DailyOffer status
   * transition + the reservation-level fan-out
   * (ReservationsService.cancelAllForOffer) + the offer.cancelled.v1
   * outbox row, all in ONE transaction (all three commit or roll back
   * together — an offer that turns out not to be cancellable never
   * reaches the fan-out at all, since the guarded update runs FIRST in the
   * same tx and throws before cancelAllForOffer is even called). Refund
   * provider I/O runs strictly AFTER that transaction commits.
   */
  private async cancelOne(
    offerId: string,
    reason: OfferCancelReason,
  ): Promise<OfferCancelResult> {
    const { expiredCount, cancelledCount, toRefund } =
      await this.prisma.$transaction(async (tx) => {
        const offer = await tx.dailyOffer.findUnique({
          where: { id: offerId },
        });
        if (!offer) throw offerNotFoundError();

        const updated = await tx.dailyOffer.updateMany({
          where: {
            id: offerId,
            status: { in: allowedFromStatusesFor("CANCELLED") },
          },
          data: { status: "CANCELLED" },
        });
        if (updated.count === 0) {
          throw new ConflictException({
            statusCode: 409,
            errorCode: "OFFER_NOT_CANCELLABLE",
            message: `Offer is in ${offer.status}, which cannot be cancelled.`,
          });
        }

        const fanOut = await this.reservations.cancelAllForOffer(tx, offerId);

        await tx.outboxEvent.create({
          data: {
            type: "offer.cancelled.v1",
            payload: {
              offerId,
              storeId: offer.storeId,
              expiredCount: fanOut.expiredCount,
              cancelledCount: fanOut.cancelledCount,
              reason,
            },
            idempotencyKey: `offer-cancelled:${offerId}`,
          },
        });

        return fanOut;
      });

    const refundResults = await this.reservations.refundMany(toRefund, reason);

    return {
      offerId,
      status: "CANCELLED" as const,
      expiredCount,
      cancelledCount,
      refundResults,
    };
  }

  async listMine(merchantId: string, date: string | undefined) {
    const dateKey = date ?? istanbulDateKey(new Date());
    const offers = await this.prisma.dailyOffer.findMany({
      where: { offerDate: offerDateToDbDate(dateKey), store: { merchantId } },
      include: {
        bagTemplate: { select: { title: true, priceCents: true } },
        store: { select: { name: true } },
      },
      orderBy: { pickupStartAt: "asc" },
    });

    return offers.map((o) => ({
      id: o.id,
      storeId: o.storeId,
      storeName: o.store.name,
      bagTemplateId: o.bagTemplateId,
      title: o.bagTemplate.title,
      priceCents: o.bagTemplate.priceCents,
      offerDate: dateKey,
      status: o.status,
      qtyTotal: o.qtyTotal,
      qtyReserved: o.qtyReserved,
      qtyRedeemed: o.qtyRedeemed,
      qtyLeft: o.qtyTotal - o.qtyReserved,
      pickupStartAt: o.pickupStartAt,
      pickupEndAt: o.pickupEndAt,
    }));
  }
}
