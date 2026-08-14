import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { OutboxEventType } from "./event-types";

export interface PublishOutboxEventParams {
  type: OutboxEventType;
  payload: Record<string, unknown>;
  /** Producer-side dedup key. Same key -> at most one row ever exists for
   * it (outbox_events.idempotencyKey is a real DB unique constraint as of
   * Task 7 — see the migration's doc comment). Omit for events with no
   * natural dedup key. */
  idempotencyKey?: string;
  /** Defers the worker's claim until this instant has passed. Omit for
   * "eligible immediately" (every event before Task 7's rating-invite). */
  scheduledFor?: Date;
}

/**
 * The in-transaction outbox write helper — every producer (offers,
 * reservations, payments, merchants) calls `outbox.publish(tx, {...})`
 * as the LAST statement of the same `$transaction` that changed the state
 * the event describes, so the event can never exist without the state
 * change it announces, or vice versa (classic transactional-outbox
 * guarantee). No constructor dependencies (Prisma's `tx` is a parameter,
 * not injected) — trivially constructible in realdb specs with
 * `new OutboxService()`.
 *
 * Idempotency: a `publish()` call carrying an `idempotencyKey` that
 * already exists on another row is a silent no-op (logged, not thrown) —
 * the caller's transaction still commits normally. This matters for a
 * producer whose transaction gets retried after a partial failure (see
 * reservations.service.ts's `createReservationWithRetry` for the general
 * shape of that pattern elsewhere in this codebase): a retry that reaches
 * this call a second time must not double-queue the same notification.
 * A `publish()` with NO idempotencyKey always inserts (nothing to dedupe
 * against).
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  async publish(
    tx: Prisma.TransactionClient,
    event: PublishOutboxEventParams,
  ): Promise<{ created: boolean }> {
    try {
      await tx.outboxEvent.create({
        data: {
          type: event.type,
          payload: event.payload as Prisma.InputJsonValue,
          idempotencyKey: event.idempotencyKey,
          scheduledFor: event.scheduledFor,
        },
      });
      return { created: true };
    } catch (err) {
      if (
        event.idempotencyKey &&
        isUniqueConstraintViolation(err, "idempotencyKey")
      ) {
        this.logger.warn(
          `Outbox event type=${event.type} idempotencyKey=${event.idempotencyKey} already exists — skipping duplicate publish`,
        );
        return { created: false };
      }
      throw err;
    }
  }
}
