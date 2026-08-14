import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { PushDispatchService } from "../../notifications/push/push-dispatch.service";
import { EmailService } from "../../notifications/email/email.service";
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

  async handle(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as OfferCancelledV1Payload;

    await Promise.all([
      this.pushAffectedConsumers(payload),
      this.emailMerchant(payload),
    ]);
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

    await this.email.sendEmail({
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
  }
}
