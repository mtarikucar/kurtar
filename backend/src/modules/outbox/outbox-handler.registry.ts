import { Injectable, Logger } from "@nestjs/common";
import { OutboxEventType } from "./event-types";
import { OutboxEventHandler } from "./outbox-handler.interface";

/**
 * type -> handler map. Every handler class self-registers in its own
 * `onModuleInit` (mirrors PaymentProviderRegistry /
 * PushProviderRegistry — modules/payments-core/payment-provider.registry.ts,
 * modules/notifications/push/push-provider.registry.ts) rather than this
 * registry importing/instantiating handlers itself, so Task 9 (and beyond)
 * adds a new handler class to OutboxModule's `providers` array and nothing
 * else — the worker (outbox-worker.service.ts) never changes.
 */
@Injectable()
export class OutboxHandlerRegistry {
  private readonly logger = new Logger(OutboxHandlerRegistry.name);
  private readonly handlers = new Map<OutboxEventType, OutboxEventHandler>();

  register(handler: OutboxEventHandler): void {
    for (const type of handler.types) {
      if (this.handlers.has(type)) {
        this.logger.warn(
          `Outbox handler for type "${type}" re-registered — the later registration wins`,
        );
      }
      this.handlers.set(type, handler);
    }
  }

  find(type: string): OutboxEventHandler | undefined {
    return this.handlers.get(type as OutboxEventType);
  }
}
