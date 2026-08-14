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
   * exactly those rows to PROCESSING and bumps `attempts` in the same
   * statement, so "claimed" and "attempt counted" can never disagree.
   */
  private async claimBatch(
    batchSize: number,
    now: Date,
  ): Promise<OutboxEvent[]> {
    return this.prisma.$queryRaw<OutboxEvent[]>(Prisma.sql`
      UPDATE "outbox_events"
      SET "status" = ${OUTBOX_STATUS.PROCESSING}, "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "outbox_events"
        WHERE "status" = ${OUTBOX_STATUS.QUEUED}
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
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
        `No handler registered for type ${event.type}`,
      );
      return "dead";
    }

    try {
      await handler.handle(event.payload, event);
      await this.markDone(event.id);
      return "done";
    } catch (err) {
      const message = (err as Error).message;
      if (event.attempts >= MAX_OUTBOX_ATTEMPTS) {
        this.logger.error(
          `Outbox event ${event.id} (type=${event.type}) exhausted ${event.attempts} attempts — marking DEAD: ${message}`,
        );
        await this.markDead(event.id, message);
        return "dead";
      }
      const nextAttemptAt = new Date(
        Date.now() + computeNextAttemptDelayMs(event.attempts),
      );
      this.logger.warn(
        `Outbox event ${event.id} (type=${event.type}) attempt ${event.attempts} failed — retrying at ${nextAttemptAt.toISOString()}: ${message}`,
      );
      await this.markRetry(event.id, message, nextAttemptAt);
      return "retried";
    }
  }

  private async markDone(id: string): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id, status: OUTBOX_STATUS.PROCESSING },
      data: { status: OUTBOX_STATUS.DONE, dispatchedAt: new Date() },
    });
  }

  private async markDead(id: string, error: string): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id, status: OUTBOX_STATUS.PROCESSING },
      data: { status: OUTBOX_STATUS.DEAD, lastError: error },
    });
  }

  private async markRetry(
    id: string,
    error: string,
    nextAttemptAt: Date,
  ): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id, status: OUTBOX_STATUS.PROCESSING },
      data: { status: OUTBOX_STATUS.QUEUED, lastError: error, nextAttemptAt },
    });
  }
}
