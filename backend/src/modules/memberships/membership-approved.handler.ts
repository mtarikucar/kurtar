import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OutboxEvent } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  OUTBOX_EVENT_TYPES,
  MerchantApprovedMembershipV1Payload,
} from "../outbox/event-types";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import { OutboxEventHandler } from "../outbox/outbox-handler.interface";
import { MembershipsService } from "./memberships.service";

/**
 * merchant.approved.membership.v1 -> create the merchant's
 * MembershipSubscription (brief §4: "On merchant APPROVED: create
 * MembershipSubscription"). A DEDICATED event type, not the pre-existing
 * merchant.approved.v1 (already MerchantStatusEmailHandler's — see that
 * event type's own doc comment in event-types.ts on why one type can only
 * ever have one handler). Registered into OutboxModule's providers (see
 * that module's doc comment on why a handler must live there to reach
 * OutboxHandlerRegistry, which is NOT exported for other modules to
 * inject) even though this class itself lives under memberships/ per Task
 * 8's file-layout brief.
 *
 * `merchant.verifiedAt` (set in the SAME transaction that emitted this
 * event — merchants.service.ts's transition()) is used as the
 * subscription's anchorDate rather than adding an `approvedAt` field to
 * the payload — it is already the authoritative approval instant.
 */
@Injectable()
export class MembershipApprovedHandler
  implements OutboxEventHandler, OnModuleInit
{
  readonly types = [OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_MEMBERSHIP_V1];
  private readonly logger = new Logger(MembershipApprovedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(rawPayload: unknown, event: OutboxEvent): Promise<void> {
    const payload = rawPayload as MerchantApprovedMembershipV1Payload;

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: payload.merchantId },
      select: { verifiedAt: true },
    });
    if (!merchant) {
      this.logger.warn(
        `${event.type}: merchant ${payload.merchantId} no longer exists — skipping membership creation`,
      );
      return;
    }

    await this.memberships.createForApprovedMerchant(
      payload.merchantId,
      merchant.verifiedAt ?? event.createdAt,
    );
  }
}
