import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OutboxEvent } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { EmailService } from "../../notifications/email/email.service";
import { maskEmail } from "../../../common/helpers/pii-mask.helper";
import {
  OUTBOX_EVENT_TYPES,
  SettlementBatchSentV1Payload,
} from "../event-types";
import { OutboxHandlerRegistry } from "../outbox-handler.registry";
import { OutboxEventHandler } from "../outbox-handler.interface";

const ISTANBUL_TZ = "Europe/Istanbul";

function formatTlDate(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: ISTANBUL_TZ }).format(
    new Date(iso),
  );
}

function formatTlAmount(cents: number): string {
  return `${(cents / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

/**
 * settlement.batch.sent.v1 -> merchant "payout-sent" email
 * (templates/emails/payout-sent.hbs — created by Task 7 but left unwired;
 * this is that wiring, per this task's brief). Mirrors
 * merchant-status-email.handler.ts's shape exactly (same owner lookup,
 * same throw-on-false-send discipline so an SMTP outage retries rather
 * than silently dropping the notification).
 */
@Injectable()
export class SettlementSentEmailHandler
  implements OutboxEventHandler, OnModuleInit
{
  readonly types = [OUTBOX_EVENT_TYPES.SETTLEMENT_BATCH_SENT_V1];
  private readonly logger = new Logger(SettlementSentEmailHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(rawPayload: unknown, event: OutboxEvent): Promise<void> {
    const payload = rawPayload as SettlementBatchSentV1Payload;

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

    const sent = await this.email.sendEmail({
      to: owner.email,
      subject: "Ödemeniz Gönderildi",
      template: "payout-sent",
      context: {
        ownerName: owner.name,
        tradeName: merchant.tradeName,
        periodStart: formatTlDate(payload.periodStart),
        periodEnd: formatTlDate(payload.periodEnd),
        netAmount: formatTlAmount(payload.netPayoutCents),
      },
    });
    if (!sent) {
      throw new Error(
        `${event.type}: failed to email merchant owner ${maskEmail(owner.email)} for batch ${payload.batchId}`,
      );
    }
  }
}
