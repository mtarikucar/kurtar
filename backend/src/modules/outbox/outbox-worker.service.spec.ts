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

/**
 * `claimed` is what claimBatch's $queryRaw call returns. `touchClaimResults`
 * (optional) is one entry per event in `claimed`, in order — each entry is
 * either the row touchClaim should return (renewal succeeded) or `null`
 * (another worker already renewed it — dispatchOne should skip). Defaults
 * to every event's OWN renewal succeeding, unchanged, which is what every
 * pre-existing (fix-round-1) test needs — the per-event lease renewal
 * (fix round 2) is transparent to them unless a test deliberately forces
 * a `null`.
 */
function buildDeps(claimed: any[] = [], touchClaimResults?: (any | null)[]) {
  const prisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(0),
    outboxEvent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  prisma.$queryRaw.mockResolvedValueOnce(claimed); // claimBatch
  const renewals = touchClaimResults ?? claimed.map((e) => [e]);
  for (const renewal of renewals) {
    prisma.$queryRaw.mockResolvedValueOnce(renewal === null ? [] : renewal); // touchClaim, per event
  }
  const registry = { find: jest.fn() };
  return { prisma, registry };
}

describe("OutboxWorkerService.drainOnce", () => {
  it("claims nothing -> returns all-zero result without touching the registry", async () => {
    const { prisma, registry } = buildDeps([]);
    const worker = new OutboxWorkerService(prisma as any, registry as any);

    const result = await worker.drainOnce();

    expect(result).toEqual({
      claimed: 0,
      done: 0,
      retried: 0,
      dead: 0,
      skipped: 0,
    });
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
    expect(result).toEqual({
      claimed: 1,
      done: 1,
      retried: 0,
      dead: 0,
      skipped: 0,
    });
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "evt1", status: "processing", claimedAt: FAKE_CLAIMED_AT },
      data: expect.objectContaining({ status: "done" }),
    });
  });

  it("[Fix round 2] a claimed event whose per-event lease renewal (touchClaim) fails — another worker already renewed it — is SKIPPED, never dispatched", async () => {
    const event = fakeEvent();
    const { prisma, registry } = buildDeps([event], [null]);
    const handle = jest.fn();
    registry.find.mockReturnValue({ types: [event.type], handle });

    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const result = await worker.drainOnce();

    expect(handle).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 1,
      done: 0,
      retried: 0,
      dead: 0,
      skipped: 1,
    });
    // No mark*() write either — the row isn't ours to update anymore.
    expect(prisma.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it("[Fix round 2] reapExhaustedStaleRows's count folds into `dead` alongside anything claimed+dispatched in the same drainOnce call", async () => {
    const event = fakeEvent({ id: "evt-normal" });
    const { prisma, registry } = buildDeps([event]);
    prisma.$executeRaw.mockResolvedValue(2); // 2 rows reaped separately
    registry.find.mockReturnValue({
      types: [event.type],
      handle: jest.fn().mockResolvedValue(undefined),
    });

    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const result = await worker.drainOnce();

    expect(result).toEqual({
      claimed: 1,
      done: 1,
      retried: 0,
      dead: 2, // from the reap step, not from dispatching `event`
      skipped: 0,
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
    expect(result).toEqual({
      claimed: 1,
      done: 1,
      retried: 0,
      dead: 0,
      skipped: 0,
    });
    // Exactly one markDone attempt — no fallback retry/dead write fired.
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledTimes(1);
  });

  it("no handler registered for the event's type -> DEAD, handler never invoked", async () => {
    const event = fakeEvent({ type: "nothing.registered.v1" });
    const { prisma, registry } = buildDeps([event]);
    registry.find.mockReturnValue(undefined);

    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const result = await worker.drainOnce();

    expect(result).toEqual({
      claimed: 1,
      done: 0,
      retried: 0,
      dead: 1,
      skipped: 0,
    });
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

    expect(result).toEqual({
      claimed: 1,
      done: 0,
      retried: 1,
      dead: 0,
      skipped: 0,
    });
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

    expect(result).toEqual({
      claimed: 1,
      done: 0,
      retried: 0,
      dead: 1,
      skipped: 0,
    });
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

    expect(result).toEqual({
      claimed: 3,
      done: 1,
      retried: 1,
      dead: 1,
      skipped: 0,
    });
  });

  it("claimBatch and reapExhaustedStaleRows pass batchSize/now/staleBefore through to the raw queries", async () => {
    const { prisma, registry } = buildDeps([]);
    const worker = new OutboxWorkerService(prisma as any, registry as any);
    const now = new Date("2026-01-01T00:00:00.000Z");
    const staleBefore = new Date(now.getTime() - 5 * 60_000);

    await worker.drainOnce(5, now);

    // reapExhaustedStaleRows runs first (via $executeRaw). Template order:
    // SET status='dead', WHERE status='processing', claimedAt<=staleBefore,
    // attempts>=MAX, LIMIT batchSize.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const reapSqlArg = prisma.$executeRaw.mock.calls[0][0];
    expect(reapSqlArg.values).toEqual([
      "dead",
      "processing",
      staleBefore,
      MAX_OUTBOX_ATTEMPTS,
      5,
    ]);

    // Then claimBatch (via $queryRaw) — the only $queryRaw call this tick,
    // since nothing was claimed for touchClaim to run against.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    // Prisma.sql template results carry the interpolated values in
    // `.values`, in template order: SET status='processing',
    // SET claimedAt=now, WHERE status='queued', nextAttemptAt<=now,
    // WHERE status='processing' (reclaim branch), claimedAt<=staleBefore,
    // attempts<MAX, scheduledFor<=now, LIMIT batchSize.
    const claimSqlArg = prisma.$queryRaw.mock.calls[0][0];
    expect(claimSqlArg.values).toEqual([
      "processing",
      now,
      "queued",
      now,
      "processing",
      staleBefore,
      MAX_OUTBOX_ATTEMPTS,
      now,
      5,
    ]);
  });
});
