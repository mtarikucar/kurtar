import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { OutboxEvent, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";
import { OUTBOX_STATUS } from "./outbox-status.constants";
import {
  computeNextAttemptDelayMs,
  MAX_OUTBOX_ATTEMPTS,
} from "./outbox-backoff";

/** Bounded batch per drain tick — "bounded batch" per the brief. A
 * genuinely large backlog just gets drained over several 15s ticks rather
 * than one worker instance ever claiming an unbounded number of rows. */
const OUTBOX_BATCH_SIZE = 20;

/**
 * [Fix round 1, Critical 1] How long a row may sit in PROCESSING before
 * it's considered abandoned (the worker that claimed it crashed / was
 * killed mid-drain — a pod roll, an OOM, a deploy) and eligible for
 * another worker to reclaim.
 *
 * [Fix round 2] This is now a PER-EVENT lease, not a per-batch one — see
 * `touchClaim`. The original version stamped ONE shared `claimedAt` for
 * the whole claimed batch at claim time, then dispatched sequentially; a
 * slow event near the front of the batch could let the lease of untouched
 * SIBLINGS later in the same batch expire while they were merely queued
 * behind it — not abandoned at all — letting another replica reclaim (and
 * duplicate-dispatch) them out from under the original worker. Re-
 * stamping `claimedAt` immediately before each event's own dispatch
 * starts means the lease clock for event N only starts when THIS worker
 * is actually about to work on it, so a slow sibling earlier in the batch
 * can never expire it.
 */
const OUTBOX_LEASE_MS = 5 * 60_000;

type DispatchOutcome = "done" | "retried" | "dead" | "skipped";

export interface DrainResult {
  claimed: number;
  done: number;
  retried: number;
  dead: number;
  /** [Fix round 2] Claimed as part of this worker's batch, but by the
   * time its turn came up in the sequential dispatch loop, its lease had
   * already been renewed by ANOTHER worker (touchClaim's optimistic-
   * concurrency check failed) — this worker correctly stepped aside
   * rather than double-dispatching it. Whoever renewed it owns the
   * outcome; it's not counted in done/retried/dead here. */
  skipped: number;
}

/**
 * Drains OutboxEvent: claims a bounded batch, dispatches each row to its
 * registered handler (OutboxHandlerRegistry), marks it DONE or schedules an
 * exponential-backoff retry (DEAD once MAX_OUTBOX_ATTEMPTS is exhausted).
 *
 * Concurrency safety (two worker instances/replicas must never dispatch
 * the same row twice): claimBatch's single UPDATE ... WHERE id IN
 * (SELECT ... FOR UPDATE SKIP LOCKED) is the whole mechanism for the
 * INITIAL claim — SKIP LOCKED means a second, concurrently-running claim
 * never even waits on rows the first claim already holds locked, so two
 * workers racing the same tick partition the queued backlog into disjoint
 * batches instead of one blocking the other. Proven by
 * outbox-worker.realdb.spec.ts's two-workers-over-20-events race.
 *
 * Crash recovery (Critical fix): claimBatch's WHERE also reclaims any
 * PROCESSING row whose lease (OUTBOX_LEASE_MS) has expired — without this,
 * a worker that crashes strictly between claiming a batch and marking it
 * DONE/DEAD/retried strands those rows in PROCESSING forever; no future
 * tick, on any replica, would ever look at them again.
 *
 * [Fix round 2] Per-event lease renewal: `dispatchOne` calls `touchClaim`
 * FIRST, which re-stamps `claimedAt` via a guarded UPDATE (matching the
 * CURRENT `claimedAt`) immediately before actually invoking the handler.
 * If that guarded UPDATE matches 0 rows, another worker already reclaimed
 * this event (its lease genuinely expired from THAT worker's point of
 * view, e.g. because this worker was stuck on an earlier, slower sibling
 * in the same batch) — this worker skips it rather than dispatching a row
 * it no longer definitively owns. Every mark*() write is likewise guarded
 * by `claimedAt` matching what the (possibly renewed) claim set.
 *
 * Reclaim ceiling: a PROCESSING row whose lease has expired AND whose
 * `attempts` has already reached MAX_OUTBOX_ATTEMPTS is never reclaimed
 * as a normal retry — `reapExhaustedStaleRows` dead-ends it directly.
 * Without this, a row that keeps getting reclaimed without its handler
 * ever throwing (the normal catch-block MAX_OUTBOX_ATTEMPTS check never
 * fires) could be reclaimed forever.
 *
 * Provider I/O discipline: claimBatch's UPDATE is the only DB write that
 * happens before a handler runs; `handler.handle()` and every mark*() call
 * below execute as independent statements OUTSIDE that transaction — a
 * slow or hanging handler (push/email provider call) never holds a row
 * lock across it. Handler runtime is additionally bounded at the provider
 * layer (ExpoPushProvider's per-chunk fetch timeout + bounded chunk
 * concurrency) so a single handler invocation can't legitimately run long
 * enough to threaten its own lease in the first place.
 */
@Injectable()
export class OutboxWorkerService {
  private readonly logger = new Logger(OutboxWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  @Cron("*/15 * * * * *", { name: "outbox-drain" })
  async drain(): Promise<void> {
    const result = await this.drainOnce();
    if (result.claimed > 0 || result.dead > 0) {
      this.logger.log(
        `Outbox drain: claimed ${result.claimed}, done ${result.done}, retried ${result.retried}, dead ${result.dead}, skipped ${result.skipped}`,
      );
    }
  }

  /** Not private — realdb specs call this directly (once, or concurrently
   * from two harness instances) instead of waiting on the cron schedule. */
  async drainOnce(
    batchSize: number = OUTBOX_BATCH_SIZE,
    now: Date = new Date(),
  ): Promise<DrainResult> {
    const reaped = await this.reapExhaustedStaleRows(batchSize, now);
    const claimed = await this.claimBatch(batchSize, now);
    let done = 0;
    let retried = 0;
    let dead = reaped;
    let skipped = 0;

    for (const event of claimed) {
      const outcome = await this.dispatchOne(event);
      if (outcome === "done") done++;
      else if (outcome === "retried") retried++;
      else if (outcome === "dead") dead++;
      else skipped++;
    }

    return { claimed: claimed.length, done, retried, dead, skipped };
  }

  /**
   * Atomic bounded-batch claim. `FOR UPDATE SKIP LOCKED` inside the
   * subquery is what makes two concurrent callers partition the backlog
   * instead of racing for the same rows — a row another transaction's
   * SELECT...FOR UPDATE already holds is simply excluded from THIS
   * subquery's result set, not blocked on. The outer UPDATE then flips
   * exactly those rows to PROCESSING, bumps `attempts`, and stamps
   * `claimedAt` in the same statement, so "claimed", "attempt counted",
   * and "lease started" can never disagree.
   *
   * The WHERE is an OR of two cases: a fresh QUEUED row whose
   * nextAttemptAt has arrived (the normal path), OR a PROCESSING row
   * whose lease has expired (the crash-recovery path — see
   * OUTBOX_LEASE_MS's doc comment) AND whose attempts hasn't already hit
   * the cap ([Fix round 2] — an already-exhausted stale row is handled by
   * `reapExhaustedStaleRows` instead, never reclaimed here). Both
   * branches still respect `scheduledFor`.
   */
  private async claimBatch(
    batchSize: number,
    now: Date,
  ): Promise<OutboxEvent[]> {
    const staleBefore = new Date(now.getTime() - OUTBOX_LEASE_MS);
    return this.prisma.$queryRaw<OutboxEvent[]>(Prisma.sql`
      UPDATE "outbox_events"
      SET "status" = ${OUTBOX_STATUS.PROCESSING}, "attempts" = "attempts" + 1, "claimedAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM "outbox_events"
        WHERE (
          ("status" = ${OUTBOX_STATUS.QUEUED} AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now}))
          OR
          ("status" = ${OUTBOX_STATUS.PROCESSING} AND "claimedAt" IS NOT NULL AND "claimedAt" <= ${staleBefore} AND "attempts" < ${MAX_OUTBOX_ATTEMPTS})
        )
          AND ("scheduledFor" IS NULL OR "scheduledFor" <= ${now})
        ORDER BY "id" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
  }

  /**
   * [Fix round 2, leg (c)] A PROCESSING row past its lease that has ALSO
   * already exhausted MAX_OUTBOX_ATTEMPTS is dead-ended directly here,
   * rather than ever being reclaimed as "processing" again by claimBatch.
   * Closes a gap the normal catch-block attempts check can't see: that
   * check only fires when `handle()` throws, but a row that keeps getting
   * reclaimed (lease expiry) WITHOUT its handler ever throwing would
   * otherwise have no bound on how many times it's reclaimed. Same
   * FOR UPDATE SKIP LOCKED discipline as claimBatch, bounded by
   * `batchSize` for the same "never an unbounded scan/write" reason.
   * Returns the number of rows dead-ended, so drainOnce can fold it into
   * DrainResult's `dead` count.
   */
  private async reapExhaustedStaleRows(
    batchSize: number,
    now: Date,
  ): Promise<number> {
    const staleBefore = new Date(now.getTime() - OUTBOX_LEASE_MS);
    // Prisma.sql + a plain function call (not the tagged-template form
    // directly on $executeRaw) — matches claimBatch's own convention, and
    // means both raw-query call sites in this file build their SQL the
    // same way.
    const reaped = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "outbox_events"
      SET "status" = ${OUTBOX_STATUS.DEAD},
          "lastError" = 'Exhausted attempts while stranded in PROCESSING past its lease (reclaim ceiling reached)'
      WHERE "id" IN (
        SELECT "id" FROM "outbox_events"
        WHERE "status" = ${OUTBOX_STATUS.PROCESSING}
          AND "claimedAt" IS NOT NULL
          AND "claimedAt" <= ${staleBefore}
          AND "attempts" >= ${MAX_OUTBOX_ATTEMPTS}
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
    `);
    if (reaped > 0) {
      this.logger.error(
        `Outbox: dead-ended ${reaped} row(s) stranded in PROCESSING past their lease with attempts already >= ${MAX_OUTBOX_ATTEMPTS} (reclaim ceiling).`,
      );
    }
    return reaped;
  }

  /**
   * [Fix round 2, leg (a)] Per-event lease renewal — the guarded UPDATE
   * that makes the lease effectively per-event rather than per-batch. Only
   * succeeds if `claimedAt` still equals what THIS worker's batch claim
   * (or a previous touchClaim) set; if another worker has already
   * reclaimed this row (its lease expired while it sat queued behind an
   * earlier, slower sibling in this SAME worker's sequential dispatch
   * loop), the match fails and this returns null — the caller skips
   * dispatching rather than racing a duplicate.
   */
  private async touchClaim(
    event: OutboxEvent,
    now: Date,
  ): Promise<OutboxEvent | null> {
    const rows = await this.prisma.$queryRaw<OutboxEvent[]>(Prisma.sql`
      UPDATE "outbox_events"
      SET "claimedAt" = ${now}
      WHERE "id" = ${event.id} AND "status" = ${OUTBOX_STATUS.PROCESSING} AND "claimedAt" = ${event.claimedAt}
      RETURNING *
    `);
    return rows[0] ?? null;
  }

  private async dispatchOne(event: OutboxEvent): Promise<DispatchOutcome> {
    const renewed = await this.touchClaim(event, new Date());
    if (!renewed) {
      this.logger.warn(
        `Outbox event ${event.id} (type=${event.type}): lease was already renewed by another worker before we reached it in this batch — skipping (whoever renewed it owns dispatching it).`,
      );
      return "skipped";
    }
    event = renewed;

    const handler = this.registry.find(event.type);
    if (!handler) {
      this.logger.error(
        `Outbox event ${event.id} (type=${event.type}): no handler registered — marking DEAD.`,
      );
      await this.markDead(
        event.id,
        event.claimedAt,
        `No handler registered for type ${event.type}`,
      );
      return "dead";
    }

    try {
      await handler.handle(event.payload, event);
    } catch (err) {
      const message = (err as Error).message;
      if (event.attempts >= MAX_OUTBOX_ATTEMPTS) {
        this.logger.error(
          `Outbox event ${event.id} (type=${event.type}) exhausted ${event.attempts} attempts — marking DEAD: ${message}`,
        );
        await this.markDead(event.id, event.claimedAt, message);
        return "dead";
      }
      const nextAttemptAt = new Date(
        Date.now() + computeNextAttemptDelayMs(event.attempts),
      );
      this.logger.warn(
        `Outbox event ${event.id} (type=${event.type}) attempt ${event.attempts} failed — retrying at ${nextAttemptAt.toISOString()}: ${message}`,
      );
      await this.markRetry(event.id, event.claimedAt, message, nextAttemptAt);
      return "retried";
    }

    // [Important 2 fix] markDone is DELIBERATELY outside the try/catch
    // above. If handle() throws, a normal backoff retry re-running it is
    // correct (it never completed). But if handle() SUCCEEDS and only
    // THIS bookkeeping write fails (a transient DB blip), catching that
    // here and scheduling a normal retry would re-run a NON-IDEMPOTENT
    // handler purely because of a bookkeeping hiccup — e.g. re-pushing
    // thousands of users. Instead: leave the row exactly as touchClaim
    // left it (status=PROCESSING, its current claimedAt) and let it fall
    // through to the stale-lease reclaim above once the lease expires —
    // that still re-dispatches the handler exactly ONE more time (a rare,
    // bounded duplicate) rather than retrying up to MAX_OUTBOX_ATTEMPTS
    // times on the normal schedule.
    try {
      await this.markDone(event.id, event.claimedAt);
    } catch (err) {
      this.logger.error(
        `Outbox event ${event.id} (type=${event.type}) handler succeeded but markDone failed — leaving PROCESSING for the stale-lease reclaim (one bounded re-dispatch), NOT scheduling a normal retry: ${(err as Error).message}`,
      );
    }
    return "done";
  }

  /**
   * Every mark*() WHERE below matches on `claimedAt` in addition to
   * `id`/`status='processing'` — optimistic concurrency against the
   * reclaim path. Without it: worker A claims/renews a row, stalls past
   * its own lease (GC pause, slow provider call, whatever), worker B
   * reclaims it (bumps attempts, sets a NEW claimedAt) and re-dispatches;
   * worker A then finally finishes and calls markDone — if that update
   * only matched on `status='processing'`, it would ALSO match (worker B
   * hasn't finished yet, row is still PROCESSING) and stomp on whatever
   * worker B is doing. Matching `claimedAt` too means worker A's stale
   * write simply matches 0 rows once worker B has reclaimed — a clean
   * no-op, never a stomp.
   */
  private async markDone(id: string, claimedAt: Date | null): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id, status: OUTBOX_STATUS.PROCESSING, claimedAt },
      data: { status: OUTBOX_STATUS.DONE, dispatchedAt: new Date() },
    });
  }

  private async markDead(
    id: string,
    claimedAt: Date | null,
    error: string,
  ): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id, status: OUTBOX_STATUS.PROCESSING, claimedAt },
      data: { status: OUTBOX_STATUS.DEAD, lastError: error },
    });
  }

  private async markRetry(
    id: string,
    claimedAt: Date | null,
    error: string,
    nextAttemptAt: Date,
  ): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id, status: OUTBOX_STATUS.PROCESSING, claimedAt },
      data: { status: OUTBOX_STATUS.QUEUED, lastError: error, nextAttemptAt },
    });
  }
}
