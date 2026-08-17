/**
 * Exponential backoff schedule for a failed outbox dispatch attempt.
 * `attempts` is the row's OutboxEvent.attempts value AFTER the claim's
 * `attempt++` (so 1 on the first failure, 2 on the second, ...) — see
 * OutboxWorkerService.claimBatch. Doubling from a 30s base, capped at 30
 * minutes so a long-broken handler (provider outage) doesn't retry less
 * often than once every half hour:
 *
 *   attempts=1 -> 30s, 2 -> 1m, 3 -> 2m, 4 -> 4m, 5 -> 8m, 6 -> exhausted (DEAD)
 */
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 30 * 60_000;

/** After this many attempts, a failing event stops retrying and is marked
 * DEAD instead — see OutboxWorkerService.dispatchOne. */
export const MAX_OUTBOX_ATTEMPTS = 6;

export function computeNextAttemptDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  const delay = BASE_DELAY_MS * 2 ** exponent;
  return Math.min(delay, MAX_DELAY_MS);
}
