import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
 * [Fix round, Important 3] A duplicate `idempotencyKey` (P2002 on that
 * column) is deliberately let PROPAGATE, never caught here. An earlier
 * version of this method caught it and returned `{created:false}` inside
 * the SAME interactive transaction — which is unsafe: once a statement
 * inside a Postgres transaction fails, the WHOLE transaction enters an
 * ABORTED state. Catching the JS exception doesn't undo that — every
 * subsequent statement (including the implicit COMMIT Prisma's
 * `$transaction` wrapper issues) fails server-side with 25P02, and
 * depending on the driver that can surface as a silent success rather
 * than a thrown error, meaning the CALLER'S entire state change (the
 * reservation confirm, the merchant approval, whatever it was) would be
 * silently rolled back while the API still returned 200. This is the
 * EXACT anti-pattern reservations.service.ts's `createReservationWithRetry`
 * doc comment already documents fixing once, for the reservation-code
 * collision case — see that comment for the fuller explanation.
 *
 * Letting P2002 propagate here means: a genuine idempotencyKey collision
 * aborts and rolls back the caller's WHOLE transaction, honestly (the
 * caller's `await this.prisma.$transaction(...)` rejects, exactly as
 * Postgres intends) — no silent partial commit. No current producer in
 * this codebase can actually trigger this path (every idempotencyKey is
 * derived from a value that's structurally unique — a terminal state
 * transition that can only succeed once, or a freshly-generated child row
 * id — see each call site's own comment), so this is a safety net, not a
 * normal-operation branch. A FUTURE producer that legitimately needs
 * "retry my whole transaction and treat a collision as already-done"
 * should dedupe OUTSIDE this transaction — either a pre-check row created
 * as its own statement before the state-mutating transaction begins
 * (payment-settle.service.ts's WebhookEventLog dedup is the existing
 * example of that shape), or by catching the propagated error at the
 * $transaction call site and retrying with a fresh key/skipping, the same
 * way `createReservationWithRetry` retries the whole transaction rather
 * than one statement inside it.
 */
@Injectable()
export class OutboxService {
  async publish(
    tx: Prisma.TransactionClient,
    event: PublishOutboxEventParams,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        type: event.type,
        payload: event.payload as Prisma.InputJsonValue,
        idempotencyKey: event.idempotencyKey,
        scheduledFor: event.scheduledFor,
      },
    });
  }
}
