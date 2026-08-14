import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OutboxEvent } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { EmailService } from "../../notifications/email/email.service";
import { OUTBOX_EVENT_TYPES, MerchantStatusV1Payload } from "../event-types";
import { OutboxHandlerRegistry } from "../outbox-handler.registry";
import { OutboxEventHandler } from "../outbox-handler.interface";

const TEMPLATE_BY_TYPE: Record<string, string> = {
  [OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_V1]: "merchant-approved",
  [OUTBOX_EVENT_TYPES.MERCHANT_REJECTED_V1]: "merchant-rejected",
  [OUTBOX_EVENT_TYPES.MERCHANT_SUSPENDED_V1]: "merchant-suspended",
};

const SUBJECT_BY_TYPE: Record<string, string> = {
  [OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_V1]: "İşletmeniz onaylandı",
  [OUTBOX_EVENT_TYPES.MERCHANT_REJECTED_V1]: "İşletme başvurunuz hakkında",
  [OUTBOX_EVENT_TYPES.MERCHANT_SUSPENDED_V1]: "Hesabınız askıya alındı",
};

/**
 * merchant.approved.v1 / merchant.rejected.v1 / merchant.suspended.v1 ->
 * merchant email (brief §5). One handler covers all three types — they
 * share the exact same payload shape and lookup, differing only in which
 * template/subject applies, so `event.type` (not the payload) decides
 * that branch.
 */
@Injectable()
export class MerchantStatusEmailHandler
  implements OutboxEventHandler, OnModuleInit
{
  readonly types = [
    OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_V1,
    OUTBOX_EVENT_TYPES.MERCHANT_REJECTED_V1,
    OUTBOX_EVENT_TYPES.MERCHANT_SUSPENDED_V1,
  ];
  private readonly logger = new Logger(MerchantStatusEmailHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(rawPayload: unknown, event: OutboxEvent): Promise<void> {
    const payload = rawPayload as MerchantStatusV1Payload;

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: payload.merchantId },
      select: { tradeName: true },
    });
    if (!merchant) {
      this.logger.warn(
        `${event.type}: merchant ${payload.merchantId} no longer exists — skipping email`,
      );
      return;
    }

    const owner = await this.prisma.merchantUser.findFirst({
      where: { merchantId: payload.merchantId, role: "OWNER" },
      select: { email: true, name: true },
    });
    if (!owner) {
      this.logger.warn(
        `${event.type}: no OWNER merchant user found for merchant ${payload.merchantId} — skipping email`,
      );
      return;
    }

    await this.email.sendEmail({
      to: owner.email,
      subject: SUBJECT_BY_TYPE[event.type],
      template: TEMPLATE_BY_TYPE[event.type],
      context: {
        ownerName: owner.name,
        tradeName: merchant.tradeName,
        note: payload.note,
      },
    });
  }
}
