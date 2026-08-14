/**
 * OutboxEvent.status is a plain string column (schema.prisma), not a DB
 * enum — this is the single source of truth for the four values the drain
 * state machine actually uses, so the worker/service/specs never hand-type
 * the string a second time.
 *
 *   queued -----> processing -----> done
 *                     |
 *                     +--(retry, attempts < cap)--> queued (nextAttemptAt in future)
 *                     |
 *                     +--(attempts >= cap)--> dead
 */
export const OUTBOX_STATUS = {
  QUEUED: "queued",
  PROCESSING: "processing",
  DONE: "done",
  DEAD: "dead",
} as const;

export type OutboxStatus = (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];
