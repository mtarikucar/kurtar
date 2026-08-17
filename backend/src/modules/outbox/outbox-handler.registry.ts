import { Injectable } from "@nestjs/common";
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
 *
 * [Fix round, I14] A duplicate registration for the SAME type now THROWS
 * at boot (during Nest's onModuleInit lifecycle) instead of warn-and-
 * overwriting ("the later registration wins"). The warn-and-overwrite
 * behavior is exactly the class of bug Task 8's own fix round hit twice
 * (two handler pairs silently colliding on merchant.approved.v1 and
 * settlement.batch.sent.v1, discoverable only by actually reading a WARN
 * line in a boot log rather than any test failing) — failing fast here
 * means the SAME mistake in a future task (Task 9 and beyond) crashes the
 * app at startup instead of silently dropping a handler.
 */
@Injectable()
export class OutboxHandlerRegistry {
  private readonly handlers = new Map<OutboxEventType, OutboxEventHandler>();

  register(handler: OutboxEventHandler): void {
    for (const type of handler.types) {
      const existing = this.handlers.get(type);
      if (existing) {
        throw new Error(
          `Outbox handler collision: type "${type}" is already registered to ${existing.constructor.name} — cannot also register it to ${handler.constructor.name}. OutboxHandlerRegistry is one-handler-per-type; add a NEW event type instead of reusing this one (see event-types.ts's OFFER_CANCELLED_MERCHANT_EMAIL_V1 / MERCHANT_APPROVED_MEMBERSHIP_V1 for the established split-the-event pattern).`,
        );
      }
      this.handlers.set(type, handler);
    }
  }

  find(type: string): OutboxEventHandler | undefined {
    return this.handlers.get(type as OutboxEventType);
  }
}
