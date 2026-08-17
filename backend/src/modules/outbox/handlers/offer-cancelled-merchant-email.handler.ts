import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { EmailService } from "../../notifications/email/email.service";
import { maskEmail } from "../../../common/helpers/pii-mask.helper";
import {
  OUTBOX_EVENT_TYPES,
  OfferCancelledMerchantEmailV1Payload,
} from "../event-types";
import { OutboxHandlerRegistry } from "../outbox-handler.registry";
import { OutboxEventHandler } from "../outbox-handler.interface";

/**
 * offer.cancelled.merchant-email.v1 -> email the merchant (brief §5).
 *
 * [Fix round 2] Split out from OfferCancelledHandler, which used to drive
 * BOTH this email and the consumer push off the SAME offer.cancelled.v1
 * event via Promise.allSettled-then-rethrow. Combined with the
 * Important-6 fix (EmailService.sendEmail's `false` return must become a
 * throw so a genuine SMTP failure retries), that meant a persistently-bad
 * merchant email retried the WHOLE handler — including re-pushing the
 * "your money is being refunded" notification to every affected consumer
 * — up to MAX_OUTBOX_ATTEMPTS times. This handler owns only the email
 * leg, so it retries (and eventually goes DEAD) independently of
 * OfferCancelledHandler's push leg.
 */
@Injectable()
export class OfferCancelledMerchantEmailHandler
  implements OutboxEventHandler, OnModuleInit
{
  readonly types = [OUTBOX_EVENT_TYPES.OFFER_CANCELLED_MERCHANT_EMAIL_V1];
  private readonly logger = new Logger(OfferCancelledMerchantEmailHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as OfferCancelledMerchantEmailV1Payload;

    const store = await this.prisma.store.findUnique({
      where: { id: payload.storeId },
      select: { name: true, merchantId: true },
    });
    if (!store) {
      this.logger.warn(
        `offer.cancelled.merchant-email.v1: store ${payload.storeId} no longer exists — skipping merchant email`,
      );
      return;
    }

    const owner = await this.prisma.merchantUser.findFirst({
      where: { merchantId: store.merchantId, role: "OWNER" },
      select: { email: true, name: true },
    });
    if (!owner) {
      this.logger.warn(
        `offer.cancelled.merchant-email.v1: no OWNER merchant user found for merchant ${store.merchantId} — skipping merchant email`,
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
        reason: payload.reason,
      },
    });
    if (!sent) {
      throw new Error(
        `offer.cancelled.merchant-email.v1: failed to email merchant owner ${maskEmail(owner.email)} for offer ${payload.offerId}`,
      );
    }
  }
}
