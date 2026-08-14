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
 * [Fix round, Critical 1] How long a row may sit in PROCESSING before it's
 * considered abandoned (the worker that claimed it crashed / was killed
 * mid-drain — a pod roll, an OOM, a deploy) and eligible for another
 * worker to reclaim. Comfortably longer than any legitimate handler run
 * (an Expo fan-out chunks at 100 messages per HTTP call — even a slow
 * provider round-trip for a large batch should finish in low tens of
 * seconds, not minutes) so a lease expiry essentially never fires against
 * a handler that's still genuinely working.
 */
const OUTBOX_LEASE_MS = 5 * 60_000;

type DispatchOutcome = "done" | "retried" | "dead";

export interface DrainResult {
  claimed: number;
  done: number;
  retried: number;
  dead: number;
}

/**
 * Drains OutboxEvent: claims a bounded batch, dispatches each row to its
 * registered handler (OutboxHandlerRegistry), marks it DONE or schedules an
 * exponential-backoff retry (DEAD once MAX_OUTBOX_ATTEMPTS is exhausted).
 *
 * Concurrency safety (two worker instances/replicas must never dispatch
 * the same row twice): claimBatch's single UPDATE ... WHERE id IN
 * (SELECT ... FOR UPDATE SKIP LOCKED) is the whole mechanism — SKIP LOCKED
 * means a second, concurrently-running claim never even waits on rows the
 * first claim already holds locked, so two workers racing the same tick
 * partition the queued backlog into disjoint batches instead of one
 * blocking the other (or, without a guard at all, both dispatching the
 * same row). Proven by outbox-worker.realdb.spec.ts's two-workers-over-20-
 * events race.
 *
 * Crash recovery (Critical fix): claimBatch's WHERE also reclaims any
 * PROCESSING row whose lease (OUTBOX_LEASE_MS) has expired — without this,
 * a worker that crashes strictly between claiming a batch and marking it
 * DONE/DEAD/retried strands those rows in PROCESSING forever; no future
 * tick, on any replica, would ever look at them again (claimBatch's
 * original WHERE only ever matched `status='queued'`). Every mark*()
 * write is additionally guarded by `claimedAt` matching what THIS claim
 * set (optimistic concurrency) — see markDone's doc comment for why that
 * matters once reclaiming is possible.
 *
 * Provider I/O discipline: claimBatch's UPDATE is the only DB write that
 * happens before a handler runs; `handler.handle()` and every mark*() call
 * below execute as independent statements OUTSIDE that transaction — a
 * slow or hanging handler (push/email provider call) never holds the
 * claim's row lock.
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
    if (result.claimed > 0) {
      this.logger.log(
        `Outbox drain: claimed ${result.claimed}, done ${result.done}, retried ${result.retried}, dead ${result.dead}`,
      );
    }
  }

  /** Not private — realdb specs call this directly (once, or concurrently
   * from two harness instances) instead of waiting on the cron schedule. */
  async drainOnce(
    batchSize: number = OUTBOX_BATCH_SIZE,
    now: Date = new Date(),
  ): Promise<DrainResult> {
    const claimed = await this.claimBatch(batchSize, now);
    let done = 0;
    let retried = 0;
    let dead = 0;

    for (const event of claimed) {
      const outcome = await this.dispatchOne(event);
      if (outcome === "done") done++;
      else if (outcome === "retried") retried++;
      else dead++;
    }

    return { claimed: claimed.length, done, retried, dead };
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
   * OUTBOX_LEASE_MS's doc comment). Both branches still respect
   * `scheduledFor`.
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
          ("status" = ${OUTBOX_STATUS.PROCESSING} AND "claimedAt" IS NOT NULL AND "claimedAt" <= ${staleBefore})
        )
          AND ("scheduledFor" IS NULL OR "scheduledFor" <= ${now})
        ORDER BY "id" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
  }

  private async dispatchOne(event: OutboxEvent): Promise<DispatchOutcome> {
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
    // thousands of users. Instead: leave the row exactly as claimBatch
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
   * reclaim path. Without it: worker A claims a row, stalls past its own
   * lease (GC pause, slow provider call, whatever), worker B's claimBatch
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
