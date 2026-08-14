import { Prisma } from "@prisma/client";
import { OutboxService } from "./outbox.service";
import { OUTBOX_EVENT_TYPES } from "./event-types";

function uniqueIdempotencyKeyViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.0",
    meta: { target: ["idempotencyKey"] },
  });
}

function buildTx(overrides: Record<string, any> = {}) {
  return {
    outboxEvent: {
      create: jest.fn().mockResolvedValue({}),
      ...overrides.outboxEvent,
    },
  } as any;
}

describe("OutboxService.publish", () => {
  it("writes a row with the given type/payload/idempotencyKey", async () => {
    const tx = buildTx();
    const service = new OutboxService();

    await service.publish(tx, {
      type: OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1,
      payload: { offerId: "o1" },
      idempotencyKey: "offer-published:o1",
    });

    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        type: "offer.published.v1",
        payload: { offerId: "o1" },
        idempotencyKey: "offer-published:o1",
        scheduledFor: undefined,
      },
    });
  });

  it("passes scheduledFor through untouched when given", async () => {
    const tx = buildTx();
    const service = new OutboxService();
    const scheduledFor = new Date("2026-01-01T02:00:00.000Z");

    await service.publish(tx, {
      type: OUTBOX_EVENT_TYPES.RESERVATION_REDEEMED_V1,
      payload: { reservationId: "r1" },
      scheduledFor,
    });

    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scheduledFor }),
      }),
    );
  });

  // [Fix round, Important 3] A duplicate idempotencyKey is deliberately
  // NEVER swallowed here — see outbox.service.ts's doc comment for the
  // full "aborted Postgres transaction" reasoning. Catching it inside the
  // same interactive $transaction (the previous behavior this test used
  // to assert) is unsafe: it can silently roll back the caller's whole
  // transaction while the API still reports success. The realdb spec
  // (outbox-publish-transaction.realdb.spec.ts) proves this against a
  // REAL Postgres transaction, which a mocked `tx` structurally cannot —
  // this unit test only proves the propagation contract at the JS level.
  it("propagates a duplicate idempotencyKey (P2002) rather than swallowing it — the caller's transaction is meant to abort", async () => {
    const violation = uniqueIdempotencyKeyViolation();
    const tx = buildTx({
      outboxEvent: { create: jest.fn().mockRejectedValue(violation) },
    });
    const service = new OutboxService();

    await expect(
      service.publish(tx, {
        type: OUTBOX_EVENT_TYPES.OFFER_CANCELLED_V1,
        payload: {},
        idempotencyKey: "offer-cancelled:o1",
      }),
    ).rejects.toBe(violation);
  });

  it("propagates a P2002 on an unrelated column identically (no special-casing by column)", async () => {
    const otherViolation = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "6.19.0", meta: { target: ["id"] } },
    );
    const tx = buildTx({
      outboxEvent: { create: jest.fn().mockRejectedValue(otherViolation) },
    });
    const service = new OutboxService();

    await expect(
      service.publish(tx, {
        type: OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1,
        payload: {},
        idempotencyKey: "x",
      }),
    ).rejects.toBe(otherViolation);
  });

  it("propagates any error when no idempotencyKey was given", async () => {
    const tx = buildTx({
      outboxEvent: {
        create: jest.fn().mockRejectedValue(new Error("db down")),
      },
    });
    const service = new OutboxService();

    await expect(
      service.publish(tx, {
        type: OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1,
        payload: {},
      }),
    ).rejects.toThrow("db down");
  });
});
