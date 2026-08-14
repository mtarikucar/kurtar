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

  it("a later registration for the same type wins over an earlier one", () => {
    const registry = new OutboxHandlerRegistry();
    const first = fakeHandler([OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1]);
    const second = fakeHandler([OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1]);
    registry.register(first);
    registry.register(second);

    expect(registry.find(OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1)).toBe(second);
  });
});
