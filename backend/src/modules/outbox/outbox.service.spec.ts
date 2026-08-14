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

    const result = await service.publish(tx, {
      type: OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1,
      payload: { offerId: "o1" },
      idempotencyKey: "offer-published:o1",
    });

    expect(result).toEqual({ created: true });
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

  it("swallows a duplicate idempotencyKey (P2002 on that column) and reports created:false", async () => {
    const tx = buildTx({
      outboxEvent: {
        create: jest.fn().mockRejectedValue(uniqueIdempotencyKeyViolation()),
      },
    });
    const service = new OutboxService();

    const result = await service.publish(tx, {
      type: OUTBOX_EVENT_TYPES.OFFER_CANCELLED_V1,
      payload: {},
      idempotencyKey: "offer-cancelled:o1",
    });

    expect(result).toEqual({ created: false });
  });

  it("rethrows a P2002 on an unrelated column (never swallows a code collision or similar)", async () => {
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

  it("rethrows any error when no idempotencyKey was given (nothing to dedupe against)", async () => {
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
