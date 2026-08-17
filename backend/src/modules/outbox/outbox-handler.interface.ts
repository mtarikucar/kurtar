import { OutboxEvent } from "@prisma/client";
import { OutboxEventType } from "./event-types";

/**
 * A handler processes one or more outbox event types. `types` is an array
 * (not a single value) so one handler class can cover several related
 * types that share a message (MerchantStatusEmailHandler covers
 * approved/rejected/suspended — one email-composing handler, three event
 * types) without the registry forcing a 1:1 class-to-type split.
 *
 * `handle` receives the already-JSON-parsed payload (typed by the caller)
 * AND the full OutboxEvent row, so a multi-type handler can branch on
 * `event.type` when it needs to (see MerchantStatusEmailHandler). Any
 * provider I/O (push send, email send) a handler does happens here,
 * OUTSIDE any DB transaction — the worker calls this strictly after the
 * claim's UPDATE has already committed.
 *
 * A thrown error means "retry me" (OutboxWorkerService schedules a backoff
 * retry, eventually DEAD after the attempt cap) — a handler that wants a
 * failure to NOT retry (e.g. a permanently malformed payload) should catch
 * it internally, log, and return normally instead of throwing.
 */
export interface OutboxEventHandler {
  readonly types: readonly OutboxEventType[];
  handle(payload: unknown, event: OutboxEvent): Promise<void>;
}
