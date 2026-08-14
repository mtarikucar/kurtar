import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  OUTBOX_EVENT_TYPES,
  SettlementBatchSentV1Payload,
} from "../outbox/event-types";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import { OutboxEventHandler } from "../outbox/outbox-handler.interface";
import { CommissionInvoiceService } from "./commission-invoice.service";

/**
 * settlement.batch.sent.invoice.v1 -> draft (and attempt to issue) the
 * batch's commission invoice(s) — see CommissionInvoiceService's doc
 * comment for the money/tax details. A DEDICATED event type, not
 * settlement.batch.sent.v1 (already SettlementSentEmailHandler's — one
 * handler per type, see that event type's doc comment in event-types.ts).
 * Registered into OutboxModule's providers (like MembershipApprovedHandler,
 * this class lives under invoicing/ but must be a provider of OutboxModule
 * to reach OutboxHandlerRegistry).
 */
@Injectable()
export class SettlementSentInvoiceHandler
  implements OutboxEventHandler, OnModuleInit
{
  readonly types = [OUTBOX_EVENT_TYPES.SETTLEMENT_BATCH_SENT_INVOICE_V1];

  constructor(
    private readonly commissionInvoices: CommissionInvoiceService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as SettlementBatchSentV1Payload;
    await this.commissionInvoices.createInvoicesForSentBatch(payload.batchId);
  }
}
