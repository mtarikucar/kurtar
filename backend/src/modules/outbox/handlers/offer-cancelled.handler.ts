import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { PushDispatchService } from "../../notifications/push/push-dispatch.service";
import { EmailService } from "../../notifications/email/email.service";
import { maskEmail } from "../../../common/helpers/pii-mask.helper";
import { OUTBOX_EVENT_TYPES, OfferCancelledV1Payload } from "../event-types";
import { OutboxHandlerRegistry } from "../outbox-handler.registry";
import { OutboxEventHandler } from "../outbox-handler.interface";

/**
 * offer.cancelled.v1 -> (a) push every consumer whose CONFIRMED
 * reservation was just cancelled+refunded (payload.reservationIds —
 * exactly the ones offers.service.ts's fan-out actually refunded, NOT the
 * expiredCount PENDING_PAYMENT ones, which were never charged) and
 * (b) email the merchant (brief §5).
 */
@Injectable()
export class OfferCancelledHandler implements OutboxEventHandler, OnModuleInit {
  readonly types = [OUTBOX_EVENT_TYPES.OFFER_CANCELLED_V1];
  private readonly logger = new Logger(OfferCancelledHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushDispatch: PushDispatchService,
    private readonly email: EmailService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  /**
   * [Fix round, Important 2] push and email are independent side effects
   * bundled into ONE outbox event. Promise.allSettled (not Promise.all) so
   * one failing doesn't hide whether the OTHER succeeded from the logs —
   * but a genuine failure on EITHER side still throws, so the event
   * retries as a whole. That means a retry re-attempts BOTH, even the one
   * that already succeeded. This is an accepted, bounded trade-off (same
   * shape as OutboxWorkerService's own markDone-failure handling): a rare
   * duplicate consumer push or merchant email on a genuine retry is
   * preferable to silently dropping a real failure with no retry at all.
   * A future improvement (splitting this into two independently-retried
   * outbox events) would close this properly; out of scope here.
   */
  async handle(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as OfferCancelledV1Payload;

    const [pushResult, emailResult] = await Promise.allSettled([
      this.pushAffectedConsumers(payload),
      this.emailMerchant(payload),
    ]);

    if (pushResult.status === "rejected") {
      this.logger.error(
        `offer.cancelled.v1 consumer push failed for offer ${payload.offerId}: ${pushResult.reason}`,
      );
    }
    if (emailResult.status === "rejected") {
      this.logger.error(
        `offer.cancelled.v1 merchant email failed for offer ${payload.offerId}: ${emailResult.reason}`,
      );
    }
    if (pushResult.status === "rejected" || emailResult.status === "rejected") {
      throw new Error(
        `offer.cancelled.v1 handler for offer ${payload.offerId}: one or more side effects failed (see logged detail above) — retrying will re-attempt BOTH push and email`,
      );
    }
  }

  private async pushAffectedConsumers(
    payload: OfferCancelledV1Payload,
  ): Promise<void> {
    if (payload.reservationIds.length === 0) return;

    const reservations = await this.prisma.reservation.findMany({
      where: { id: { in: payload.reservationIds } },
      select: { userId: true },
    });

    const result = await this.pushDispatch.notifyUsers(
      reservations.map((r) => r.userId),
      "RESERVATION_CANCELLED_REFUND",
      () => ({
        title: "Rezervasyonun iptal edildi",
        body: "Paketin iptal edildi, ücretin iade ediliyor.",
        data: { offerId: payload.offerId, storeId: payload.storeId },
      }),
    );
    this.logger.log(
      `offer.cancelled.v1 consumer push for offer ${payload.offerId}: sent=${result.sent}/${result.candidates}`,
    );
  }

  private async emailMerchant(payload: OfferCancelledV1Payload): Promise<void> {
    const store = await this.prisma.store.findUnique({
      where: { id: payload.storeId },
      select: { name: true, merchantId: true },
    });
    if (!store) {
      this.logger.warn(
        `offer.cancelled.v1: store ${payload.storeId} no longer exists — skipping merchant email`,
      );
      return;
    }

    const owner = await this.prisma.merchantUser.findFirst({
      where: { merchantId: store.merchantId, role: "OWNER" },
      select: { email: true, name: true },
    });
    if (!owner) {
      this.logger.warn(
        `offer.cancelled.v1: no OWNER merchant user found for merchant ${store.merchantId} — skipping merchant email`,
      );
      return;
    }

    // [Fix round, Important 6] EmailService.sendEmail returns `false` on a
    // genuine delivery failure rather than throwing (log-only, so a
    // best-effort mock-mode send never blocks) — that return value MUST
    // be checked and turned into a throw here, or the outbox worker marks
    // this event done and never retries a real SMTP outage.
    const sent = await this.email.sendEmail({
      to: owner.email,
      subject: "Paket iptal edildi",
      template: "offer-cancelled-merchant",
      context: {
        ownerName: owner.name,
        storeName: store.name,
        expiredCount: payload.expiredCount,
        cancelledCount: payload.cancelledCount,
      },
    });
    if (!sent) {
      throw new Error(
        `offer.cancelled.v1: failed to email merchant owner ${maskEmail(owner.email)} for offer ${payload.offerId}`,
      );
    }
  }
}
