import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OutboxEvent } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { EmailService } from "../../notifications/email/email.service";
import { maskEmail } from "../../../common/helpers/pii-mask.helper";
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

const DEFAULT_MERCHANT_DASHBOARD_URL = "https://merchant.kurtar.app";

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
  private readonly dashboardUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly registry: OutboxHandlerRegistry,
    private readonly configService: ConfigService,
  ) {
    this.dashboardUrl =
      this.configService.get<string>("MERCHANT_DASHBOARD_URL") ||
      DEFAULT_MERCHANT_DASHBOARD_URL;
  }

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

    // [Fix round, Important 6] sendEmail returns `false` (never throws) on
    // a genuine delivery failure — that MUST be checked and turned into a
    // throw, or the worker marks this DONE and an SMTP outage during an
    // approval sweep means merchants are simply never told, with no retry.
    const sent = await this.email.sendEmail({
      to: owner.email,
      subject: SUBJECT_BY_TYPE[event.type],
      template: TEMPLATE_BY_TYPE[event.type],
      context: {
        ownerName: owner.name,
        tradeName: merchant.tradeName,
        note: payload.note,
        // [Fix round, cheap minor] merchant-approved.hbs renders
        // {{dashboardUrl}} as its CTA button — previously never supplied,
        // rendering a dead link. MERCHANT_DASHBOARD_URL is optional; falls
        // back to a sane default rather than requiring boot-time config
        // for a cosmetic link.
        dashboardUrl: this.dashboardUrl,
      },
    });
    if (!sent) {
      throw new Error(
        `${event.type}: failed to email merchant owner ${maskEmail(owner.email)} for merchant ${payload.merchantId}`,
      );
    }
  }
}
