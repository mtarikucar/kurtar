import { OutboxWorkerService } from "./outbox-worker.service";
import { MAX_OUTBOX_ATTEMPTS } from "./outbox-backoff";

const FAKE_CLAIMED_AT = new Date("2026-01-01T00:00:00.000Z");

function fakeEvent(overrides: Record<string, any> = {}) {
  return {
    id: "evt1",
    type: "offer.published.v1",
    payload: { offerId: "o1" },
    idempotencyKey: null,
    scheduledFor: null,
    status: "processing",
    attempts: 1,
    lastError: null,
    dispatchedAt: null,
    nextAttemptAt: null,
    claimedAt: FAKE_CLAIMED_AT,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildDeps(claimed: any[] = []) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue(claimed),
    outboxEvent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const registry = { find: jest.fn() };
  return { prisma, registry };
}

describe("OutboxWorkerService.drainOnce", () => {
  it("claims nothing -> returns all-zero result without touching the registry", async () => {
    const { prisma, registry } = buildDeps([]);
    const worker = new OutboxWorkerService(prisma as any, registry as any);

    const result = await worker.drainOnce();

    expect(result).toEqual({ claimed: 0, done: 0, retried: 0, dead: 0 });
    expect(registry.find).not.toHaveBeenCalled();
  });

  it("a handler that resolves marks the event DONE, guarded by id+status+claimedAt", async () => {
    const event = fakeEvent();
    const { prisma, registry } = buildDeps([event]);
    const handle = jest.fn().mockResolvedValue(undefined);
    registry.find.mockReturnValue({ types: [event.type], handle });

    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const result = await worker.drainOnce();

    expect(handle).toHaveBeenCalledWith(event.payload, event);
    expect(result).toEqual({ claimed: 1, done: 1, retried: 0, dead: 0 });
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "evt1", status: "processing", claimedAt: FAKE_CLAIMED_AT },
      data: expect.objectContaining({ status: "done" }),
    });
  });

  it("[Important 2 fix] a handler that succeeds but whose markDone bookkeeping write fails does NOT schedule a retry — it's still reported 'done' and left for the stale-lease reclaim, never re-dispatched via the normal backoff path", async () => {
    const event = fakeEvent();
    const { prisma, registry } = buildDeps([event]);
    const handle = jest.fn().mockResolvedValue(undefined);
    registry.find.mockReturnValue({ types: [event.type], handle });
    prisma.outboxEvent.updateMany.mockRejectedValue(
      new Error("connection reset"),
    );

    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const result = await worker.drainOnce();

    expect(handle).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ claimed: 1, done: 1, retried: 0, dead: 0 });
    // Exactly one markDone attempt — no fallback retry/dead write fired.
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledTimes(1);
  });

  it("no handler registered for the event's type -> DEAD, handler never invoked", async () => {
    const event = fakeEvent({ type: "nothing.registered.v1" });
    const { prisma, registry } = buildDeps([event]);
    registry.find.mockReturnValue(undefined);

    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const result = await worker.drainOnce();

    expect(result).toEqual({ claimed: 1, done: 0, retried: 0, dead: 1 });
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "evt1", status: "processing", claimedAt: FAKE_CLAIMED_AT },
      data: expect.objectContaining({ status: "dead" }),
    });
  });

  it("a handler that throws with attempts below the cap schedules a retry (back to QUEUED with a future nextAttemptAt)", async () => {
    const event = fakeEvent({ attempts: 2 });
    const { prisma, registry } = buildDeps([event]);
    registry.find.mockReturnValue({
      types: [event.type],
      handle: jest.fn().mockRejectedValue(new Error("provider down")),
    });

    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const before = Date.now();
    const result = await worker.drainOnce();

    expect(result).toEqual({ claimed: 1, done: 0, retried: 1, dead: 0 });
    const call = prisma.outboxEvent.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      id: "evt1",
      status: "processing",
      claimedAt: FAKE_CLAIMED_AT,
    });
    expect(call.data.status).toBe("queued");
    expect(call.data.lastError).toBe("provider down");
    // attempts=2 -> 60s backoff (see outbox-backoff.spec.ts)
    expect(call.data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      before + 60_000,
    );
  });

  it(`a handler that throws with attempts >= ${MAX_OUTBOX_ATTEMPTS} (the cap) marks DEAD instead of retrying`, async () => {
    const event = fakeEvent({ attempts: MAX_OUTBOX_ATTEMPTS });
    const { prisma, registry } = buildDeps([event]);
    registry.find.mockReturnValue({
      types: [event.type],
      handle: jest.fn().mockRejectedValue(new Error("still broken")),
    });

    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const result = await worker.drainOnce();

    expect(result).toEqual({ claimed: 1, done: 0, retried: 0, dead: 1 });
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "evt1", status: "processing", claimedAt: FAKE_CLAIMED_AT },
      data: expect.objectContaining({
        status: "dead",
        lastError: "still broken",
      }),
    });
  });

  it("aggregates mixed outcomes across a batch correctly", async () => {
    // Distinct types so registry.find's per-type mock can give each event
    // genuinely different handler behavior — two events sharing a type
    // would share a handler and collapse this into a same-outcome case.
    const done = fakeEvent({ id: "e-done", type: "offer.published.v1" });
    const dead = fakeEvent({ id: "e-dead", type: "unknown.v1" });
    const retried = fakeEvent({
      id: "e-retry",
      type: "offer.cancelled.v1",
      attempts: 1,
    });
    const { prisma, registry } = buildDeps([done, dead, retried]);
    registry.find.mockImplementation((type: string) => {
      if (type === "unknown.v1") return undefined;
      if (type === "offer.published.v1") {
        return {
          types: [type],
          handle: jest.fn().mockResolvedValue(undefined),
        };
      }
      return {
        types: [type],
        handle: jest.fn().mockRejectedValue(new Error("boom")),
      };
    });

    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const result = await worker.drainOnce();

    expect(result).toEqual({ claimed: 3, done: 1, retried: 1, dead: 1 });
  });

  it("claimBatch passes batchSize/now/staleBefore through to the raw claim query", async () => {
    const { prisma, registry } = buildDeps([]);
    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const now = new Date("2026-01-01T00:00:00.000Z");
    const staleBefore = new Date(now.getTime() - 5 * 60_000);

    await worker.drainOnce(5, now);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    // Prisma.sql template results carry the interpolated values in
    // `.values`, in template order: SET status='processing',
    // SET claimedAt=now, WHERE status='queued', nextAttemptAt<=now,
    // WHERE status='processing' (reclaim branch), claimedAt<=staleBefore,
    // scheduledFor<=now, LIMIT batchSize.
    const sqlArg = prisma.$queryRaw.mock.calls[0][0];
    expect(sqlArg.values).toEqual([
      "processing",
      now,
      "queued",
      now,
      "processing",
      staleBefore,
      now,
      5,
    ]);
  });
});
