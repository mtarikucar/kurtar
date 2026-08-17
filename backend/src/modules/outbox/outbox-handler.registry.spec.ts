import { OutboxHandlerRegistry } from "./outbox-handler.registry";
import { OutboxEventHandler } from "./outbox-handler.interface";
import { OUTBOX_EVENT_TYPES } from "./event-types";

function fakeHandler(
  types: (typeof OUTBOX_EVENT_TYPES)[keyof typeof OUTBOX_EVENT_TYPES][],
): OutboxEventHandler & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    types,
    calls,
    handle: async (payload) => {
      calls.push(payload);
    },
  };
}

describe("OutboxHandlerRegistry", () => {
  it("dispatches find(type) to the handler registered for that type", () => {
    const registry = new OutboxHandlerRegistry();
    const handler = fakeHandler([OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1]);
    registry.register(handler);

    expect(registry.find(OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1)).toBe(handler);
  });

  it("returns undefined for a type nothing registered", () => {
    const registry = new OutboxHandlerRegistry();
    expect(registry.find("nothing.registered.v1")).toBeUndefined();
  });

  it("one handler instance can cover multiple types (merchant status email shape)", () => {
    const registry = new OutboxHandlerRegistry();
    const handler = fakeHandler([
      OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_V1,
      OUTBOX_EVENT_TYPES.MERCHANT_REJECTED_V1,
      OUTBOX_EVENT_TYPES.MERCHANT_SUSPENDED_V1,
    ]);
    registry.register(handler);

    expect(registry.find(OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_V1)).toBe(
      handler,
    );
    expect(registry.find(OUTBOX_EVENT_TYPES.MERCHANT_REJECTED_V1)).toBe(
      handler,
    );
    expect(registry.find(OUTBOX_EVENT_TYPES.MERCHANT_SUSPENDED_V1)).toBe(
      handler,
    );
  });

  it("[Fix round, I14] a second registration for the same type THROWS instead of silently overwriting", () => {
    const registry = new OutboxHandlerRegistry();
    const first = fakeHandler([OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1]);
    const second = fakeHandler([OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1]);
    registry.register(first);

    expect(() => registry.register(second)).toThrow(/collision/i);
    // The original registration is untouched — the failed second
    // registration never silently replaced it.
    expect(registry.find(OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1)).toBe(first);
  });

  it("a collision on only ONE of several types in a multi-type handler still throws", () => {
    const registry = new OutboxHandlerRegistry();
    registry.register(fakeHandler([OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_V1]));
    const colliding = fakeHandler([
      OUTBOX_EVENT_TYPES.MERCHANT_REJECTED_V1, // no collision
      OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_V1, // collides
    ]);

    expect(() => registry.register(colliding)).toThrow(/collision/i);
  });
});
