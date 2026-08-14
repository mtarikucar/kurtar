import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { PushDispatchService } from "../../notifications/push/push-dispatch.service";
import { OUTBOX_EVENT_TYPES, OfferCancelledV1Payload } from "../event-types";
import { OutboxHandlerRegistry } from "../outbox-handler.registry";
import { OutboxEventHandler } from "../outbox-handler.interface";

/**
 * offer.cancelled.v1 -> push every consumer whose CONFIRMED reservation
 * was just cancelled+refunded (payload.reservationIds — exactly the ones
 * offers.service.ts's fan-out actually refunded, NOT the expiredCount
 * PENDING_PAYMENT ones, which were never charged) (brief §5).
 *
 * [Fix round 2] Push-only. The merchant-email leg used to be bundled into
 * this SAME handler/event via Promise.allSettled-then-rethrow — combined
 * with Important 6's email-throw-on-false fix, a persistently-failing
 * email retried the WHOLE handler (re-pushing every already-notified
 * consumer) up to MAX_OUTBOX_ATTEMPTS times. Splitting the email into its
 * own OfferCancelledMerchantEmailHandler, driven by its own
 * offer.cancelled.merchant-email.v1 event (see event-types.ts's doc
 * comment and offers.service.ts's cancelOne — both events are emitted in
 * the same transaction), means each leg now retries independently.
 */
@Injectable()
export class OfferCancelledHandler implements OutboxEventHandler, OnModuleInit {
  readonly types = [OUTBOX_EVENT_TYPES.OFFER_CANCELLED_V1];
  private readonly logger = new Logger(OfferCancelledHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushDispatch: PushDispatchService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as OfferCancelledV1Payload;
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
}
