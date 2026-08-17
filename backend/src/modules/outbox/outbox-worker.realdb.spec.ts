import { PrismaClient } from "@prisma/client";
import { OutboxWorkerService } from "./outbox-worker.service";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";
import { OutboxEventHandler } from "./outbox-handler.interface";
import { OutboxEventType } from "./event-types";
import { MAX_OUTBOX_ATTEMPTS } from "./outbox-backoff";

// These specs exercise the worker's generic claim/dispatch/retry/schedule
// mechanics, not any specific event contract — fake, worker-local type
// strings (never written by a real producer) keep that intent obvious.
// OutboxEventHandler.types is typed against the real OutboxEventType
// catalog (event-types.ts), so these need a narrow cast.
function fakeType(type: string): OutboxEventType {
  return type as OutboxEventType;
}

/**
 * Real-DB proof of OutboxWorkerService's drain mechanics against genuine
 * Postgres row locking — three of the brief's five required realdb
 * scenarios, all sharing this file's harness (mirrors
 * reservations.realdb.spec.ts grouping its several race scenarios in one
 * file):
 *   (a) two concurrent workers over 20 pending events -> each dispatched
 *       exactly once (FOR UPDATE SKIP LOCKED partitions the batch)
 *   (c) retry -> exponential backoff -> DEAD once MAX_OUTBOX_ATTEMPTS is
 *       exhausted
 *   (e) scheduledFor in the future is skipped, then dispatched once that
 *       instant has passed — proven via drainOnce's explicit `now`
 *       parameter, never a real sleep
 *   plus two fix-round regressions:
 *     - Critical 1: a row stranded in PROCESSING past its lease (the
 *       crash-mid-drain scenario) is reclaimed and dispatched exactly
 *       once; a row still legitimately in-flight (fresh claimedAt) is
 *       left alone.
 *     - Fix round 2, leg (a): a slow FIRST event in a claimed batch does
 *       not cause its untouched batch-mates' SHARED initial claimedAt to
 *       be mistaken for genuine abandonment by another replica — the
 *       per-event lease renewal (touchClaim) means a worker that's merely
 *       queued behind a slow sibling in its own sequential loop, not
 *       actually reclaimed, never double-dispatches.
 *
 * (b) offer.published fan-out and (d) the pickup-reminder cron are their
 * own files (handlers/offer-published-fanout.realdb.spec.ts,
 * reservations/pickup-reminder-cron.realdb.spec.ts) — different domain
 * fixtures (favorites/location/notifications, reservations), not this
 * generic worker harness.
 *
 * Every seeded OutboxEvent's idempotencyKey is prefixed with this suite's
 * own tag (OUTBOX_TEST_PREFIX) so afterAll's cleanup — and this file's own
 * assertions, which read rows back by id — never touch a row another
 * concurrently-running realdb spec file created (Jest's `--maxWorkers=2`
 * runs test FILES in true parallel processes against the same database;
 * see reservations.realdb.spec.ts's [I8] doc comment for the same
 * discipline).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const OUTBOX_TEST_PREFIX = "outbox-worker-realdb-test";

function buildWorker(
  prisma: PrismaClient,
  handler: OutboxEventHandler,
): OutboxWorkerService {
  const registry = new OutboxHandlerRegistry();
  registry.register(handler);
  return new OutboxWorkerService(prisma as any, registry);
}

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[outbox-worker.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

let seedCounter = 0;
function nextIdempotencyKey(): string {
  return `${OUTBOX_TEST_PREFIX}:${Date.now()}:${seedCounter++}`;
}

d("OutboxWorkerService — real DB concurrency + retry + scheduling", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    const url = new URL(TEST_DATABASE_URL!);
    // Two genuinely concurrent drainOnce() calls in test (a) each open
    // their own connection — bump the pool the same way
    // reservations.realdb.spec.ts does for its 50-way race.
    url.searchParams.set("connection_limit", "20");
    url.searchParams.set("pool_timeout", "30");
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await safeCleanup("outboxEvent", () =>
      prisma.outboxEvent.deleteMany({
        where: { idempotencyKey: { startsWith: OUTBOX_TEST_PREFIX } },
      }),
    );
    await prisma.$disconnect();
  });

  it("[a] two concurrent workers draining the SAME 20 queued events dispatch each exactly once", async () => {
    const seeded = await Promise.all(
      Array.from({ length: 20 }, () =>
        prisma.outboxEvent.create({
          data: {
            type: "test.concurrency.v1",
            payload: {},
            idempotencyKey: nextIdempotencyKey(),
          },
        }),
      ),
    );

    const dispatchLog: string[] = [];
    // The SAME handler instance, registered independently into each
    // worker's own OutboxHandlerRegistry, closing over ONE shared
    // `dispatchLog` array — a double-dispatch of any single row (by
    // either worker) would show up as a duplicate id in that one array.
    const handler: OutboxEventHandler = {
      types: [fakeType("test.concurrency.v1")],
      handle: async (_payload, event) => {
        dispatchLog.push(event.id);
      },
    };
    const workerA = buildWorker(prisma, handler);
    const workerB = buildWorker(prisma, handler);

    const [resultA, resultB] = await Promise.all([
      // Batch size 25, not 20: the claim query is intentionally NOT typed-
      // scoped (a real drain must claim whatever's due, of any type) — a
      // shared dev database can have unrelated queued debris from other
      // testing. Over-claiming those doesn't affect this assertion, which
      // is scoped to dispatchLog (only OUR handler, only OUR type) and to
      // the 20 seeded ids specifically, never a raw claimed-count total.
      workerA.drainOnce(25),
      workerB.drainOnce(25),
    ]);
    expect(resultA.claimed + resultB.claimed).toBeGreaterThanOrEqual(20);

    expect(dispatchLog).toHaveLength(20);
    expect(new Set(dispatchLog).size).toBe(20); // no id dispatched twice
    expect(new Set(dispatchLog)).toEqual(new Set(seeded.map((r) => r.id)));

    const finalRows = await prisma.outboxEvent.findMany({
      where: { id: { in: seeded.map((r) => r.id) } },
    });
    expect(finalRows.every((r) => r.status === "done")).toBe(true);
    expect(finalRows.every((r) => r.attempts === 1)).toBe(true);
  }, 15_000);

  it("[c] a permanently-failing handler retries with backoff, then goes DEAD once MAX_OUTBOX_ATTEMPTS is exhausted", async () => {
    const seeded = await prisma.outboxEvent.create({
      data: {
        type: "test.retry.v1",
        payload: {},
        idempotencyKey: nextIdempotencyKey(),
      },
    });
    const handler: OutboxEventHandler = {
      types: [fakeType("test.retry.v1")],
      handle: async () => {
        throw new Error("always fails");
      },
    };
    const worker = buildWorker(prisma, handler);

    // Every assertion in this loop is scoped to OUR seeded row (re-read by
    // id), never the drain's aggregate claimed/retried/dead counts — the
    // claim query is intentionally type-unscoped, so a shared dev database
    // can carry unrelated queued debris from sibling realdb spec files
    // into the SAME batch.
    for (let attempt = 1; attempt <= MAX_OUTBOX_ATTEMPTS; attempt++) {
      const before = Date.now();
      await worker.drainOnce(10);

      const row = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: seeded.id },
      });
      expect(row.attempts).toBe(attempt);

      if (attempt < MAX_OUTBOX_ATTEMPTS) {
        expect(row.status).toBe("queued");
        // Genuine exponential backoff was actually written — a real
        // future nextAttemptAt, not just "eventually DEAD".
        expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(before);

        // No sleeps: force nextAttemptAt into the past so the next
        // iteration's drainOnce() (real `now`) reclaims it immediately
        // instead of waiting out the real backoff delay.
        await prisma.outboxEvent.update({
          where: { id: seeded.id },
          data: { nextAttemptAt: new Date(Date.now() - 1000) },
        });
      } else {
        expect(row.status).toBe("dead");
      }
    }

    const final = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(final.status).toBe("dead");
    expect(final.attempts).toBe(MAX_OUTBOX_ATTEMPTS);
    expect(final.lastError).toBe("always fails");

    // A DEAD row is never reclaimed by a further drain, no matter how far
    // `now` is pushed forward. Scoped to OUR row specifically (re-read by
    // id) rather than a global claimed-count — a shared dev database can
    // have unrelated queued events from sibling realdb spec files
    // (offers/reservations/payments/merchants now emit real outbox
    // events too) landing in the same permissive, type-unscoped claim.
    await worker.drainOnce(
      10,
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    );
    const stillDead = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(stillDead.status).toBe("dead");
    expect(stillDead.attempts).toBe(MAX_OUTBOX_ATTEMPTS);
  }, 20_000);

  it("[e] scheduledFor in the future is skipped, then dispatched once that instant has passed (no sleep — explicit `now`)", async () => {
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000); // +1h
    const seeded = await prisma.outboxEvent.create({
      data: {
        type: "test.scheduled.v1",
        payload: {},
        idempotencyKey: nextIdempotencyKey(),
        scheduledFor,
      },
    });
    let handleCalls = 0;
    const handler: OutboxEventHandler = {
      types: [fakeType("test.scheduled.v1")],
      handle: async () => {
        handleCalls++;
      },
    };
    const worker = buildWorker(prisma, handler);

    // Assertions below are scoped to OUR seeded row and OUR handler's own
    // call count — never a raw claimed/done total — for the same reason
    // test (a)/(c) are: the claim query is intentionally type-unscoped,
    // and a shared dev database can carry unrelated queued debris from
    // sibling realdb spec files.
    await worker.drainOnce(10); // real "now" — still before scheduledFor
    expect(handleCalls).toBe(0);
    const stillQueued = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(stillQueued.status).toBe("queued");

    await worker.drainOnce(10, new Date(scheduledFor.getTime() + 1000));
    expect(handleCalls).toBe(1);

    const final = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(final.status).toBe("done");
  }, 15_000);

  it("[Critical fix] a row stranded in PROCESSING past its lease (crash mid-drain) is reclaimed and dispatched exactly once; a row still legitimately in-flight (fresh claimedAt) is left alone", async () => {
    // Simulates a worker that claimed this row (bumping attempts to 1,
    // setting claimedAt) and then crashed before ever calling handle() or
    // any mark*() — the exact "pod roll mid-drain" scenario. 10 minutes
    // ago is well past OUTBOX_LEASE_MS (5 minutes).
    const staleClaimedAt = new Date(Date.now() - 10 * 60 * 1000);
    const stranded = await prisma.outboxEvent.create({
      data: {
        type: "test.strand.v1",
        payload: {},
        idempotencyKey: nextIdempotencyKey(),
        status: "processing",
        attempts: 1,
        claimedAt: staleClaimedAt,
      },
    });
    // A second row, ALSO in PROCESSING, but claimed just now — as if by a
    // still-alive worker genuinely in the middle of handling it. Must NOT
    // be reclaimed.
    const inFlight = await prisma.outboxEvent.create({
      data: {
        type: "test.strand.v1",
        payload: {},
        idempotencyKey: nextIdempotencyKey(),
        status: "processing",
        attempts: 1,
        claimedAt: new Date(),
      },
    });

    const dispatchLog: string[] = [];
    const handler: OutboxEventHandler = {
      types: [fakeType("test.strand.v1")],
      handle: async (_payload, event) => {
        dispatchLog.push(event.id);
      },
    };
    const worker = buildWorker(prisma, handler);

    await worker.drainOnce(10);

    expect(dispatchLog).toEqual([stranded.id]);
    expect(dispatchLog).not.toContain(inFlight.id);

    const strandedFinal = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: stranded.id },
    });
    expect(strandedFinal.status).toBe("done");
    // The reclaim counts as another attempt (2, not 1) — it's a genuine
    // re-claim of the row, exactly like a normal retry would be.
    expect(strandedFinal.attempts).toBe(2);

    const inFlightFinal = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: inFlight.id },
    });
    expect(inFlightFinal.status).toBe("processing"); // untouched
    expect(inFlightFinal.attempts).toBe(1);

    // A second drain must not reclaim the now-DONE stranded row again.
    dispatchLog.length = 0;
    await worker.drainOnce(10);
    expect(dispatchLog).toEqual([]);

    // Cleanup: inFlight is left PROCESSING forever otherwise (afterAll's
    // idempotencyKey-prefix delete still catches it regardless of status,
    // but flip it out of PROCESSING here too so a sibling suite's own
    // permissive claim query never has a chance to pick it up first).
    await prisma.outboxEvent.update({
      where: { id: inFlight.id },
      data: { status: "dead", lastError: "test fixture cleanup" },
    });
  }, 15_000);

  it("[Fix round 2, leg (a)] a slow FIRST event in a batch does not get its later batch-mates double-dispatched once their SHARED initial claimedAt goes stale — per-event lease renewal (touchClaim) protects them", async () => {
    // 3 events, claimed together in ONE batch by worker A — the original
    // (fix-round-1) design stamped one SHARED claimedAt for the whole
    // batch at claim time; if worker A is still stuck on the first event
    // when a later batch-mate's (shared) lease goes stale, another
    // replica could legitimately reclaim — and duplicate-dispatch — a
    // sibling that was never actually abandoned, just queued behind a
    // slow one in worker A's own sequential loop.
    const seeded = await Promise.all(
      Array.from({ length: 3 }, () =>
        prisma.outboxEvent.create({
          data: {
            type: "test.slow-batch.v1",
            payload: {},
            idempotencyKey: nextIdempotencyKey(),
          },
        }),
      ),
    );
    const seededIds = seeded.map((r) => r.id);

    let releaseFirst: () => void = () => {};
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    // Resolved by the handler the INSTANT it captures which event it's
    // blocking on — the deterministic signal the test awaits instead of
    // polling DB state (claimBatch alone would already show every row as
    // PROCESSING before dispatch — let alone handle() — has even started
    // for the first one, so DB status isn't the right signal here).
    let markHandlerStarted: () => void = () => {};
    const handlerStarted = new Promise<void>((resolve) => {
      markHandlerStarted = resolve;
    });
    let blockedEventId: string | null = null;
    const dispatchLogA: string[] = [];
    const dispatchLogB: string[] = [];

    const handlerA: OutboxEventHandler = {
      types: [fakeType("test.slow-batch.v1")],
      handle: async (_payload, event) => {
        if (blockedEventId === null) {
          blockedEventId = event.id;
          markHandlerStarted();
          await firstBlocked; // no wall-clock sleep — a controllable deferred
        }
        dispatchLogA.push(event.id);
      },
    };
    const handlerB: OutboxEventHandler = {
      types: [fakeType("test.slow-batch.v1")],
      handle: async (_payload, event) => {
        dispatchLogB.push(event.id);
      },
    };

    const workerA = buildWorker(prisma, handlerA);
    const workerB = buildWorker(prisma, handlerB);

    // Worker A claims the whole batch (shared initial claimedAt) and
    // starts dispatching sequentially — blocks on whichever event it
    // reaches first (touchClaim succeeds for it, then handle() blocks).
    const drainAPromise = workerA.drainOnce(10);

    await handlerStarted; // deterministic: handlerA has captured blockedEventId and is now blocked
    const blockedId = blockedEventId!;
    const laterIds = seededIds.filter((id) => id !== blockedId);
    expect(laterIds).toHaveLength(2);

    // Simulate enough wall-clock time passing that the batch's SHARED
    // initial claimedAt would be stale for the events worker A hasn't
    // reached yet (it's still blocked on the first one). WITHOUT the
    // per-event touchClaim fix, this is exactly the window that let
    // another replica reclaim (and duplicate-dispatch) a batch-mate still
    // legitimately queued behind a slow sibling in the SAME worker's own
    // loop.
    await prisma.outboxEvent.updateMany({
      where: { id: { in: laterIds } },
      data: { claimedAt: new Date(Date.now() - 10 * 60 * 1000) },
    });

    // Worker B's drain legitimately reclaims them (genuinely stale from
    // ITS point of view too) and dispatches both.
    await workerB.drainOnce(10);
    expect(dispatchLogB.slice().sort()).toEqual(laterIds.slice().sort());

    // NOW let worker A's blocked event finish — its for-loop moves on to
    // the two later events, but touchClaim on each fails (worker B
    // already changed their claimedAt), so worker A SKIPS them rather
    // than double-dispatching.
    releaseFirst();
    const resultA = await drainAPromise;

    expect(dispatchLogA).toEqual([blockedId]); // worker A only ever dispatched the blocked one
    // >= rather than ===: resultA.skipped is drainOnce's own platform-wide
    // tally (this worker's WHOLE claimed batch, not just our 3 seeded
    // rows), so a sibling realdb spec's undrained debris landing in the
    // SAME claim could in principle add its own skip to this count. The
    // load-bearing guarantee — that our two reclaimed-out-from-under-it
    // events were genuinely skipped rather than double-dispatched — is
    // already fully proven by the scoped dispatchLogA/dispatchLogB/
    // allDispatched checks around this line; this is corroborating
    // evidence, not the thing under test, so it only needs a floor.
    expect(resultA.skipped).toBeGreaterThanOrEqual(2);

    // Every seeded event was dispatched EXACTLY once, across both
    // workers.
    const allDispatched = [...dispatchLogA, ...dispatchLogB];
    expect(allDispatched.slice().sort()).toEqual(seededIds.slice().sort());
    expect(new Set(allDispatched).size).toBe(3);

    const finalRows = await prisma.outboxEvent.findMany({
      where: { id: { in: seededIds } },
    });
    expect(finalRows.every((r) => r.status === "done")).toBe(true);
  }, 15_000);
});
