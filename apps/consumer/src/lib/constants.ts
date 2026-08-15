/**
 * `CANCEL_DEADLINE_BEFORE_PICKUP_MS` — mirrors the backend's own fixed
 * constant (backend/src/modules/reservations/reservations.service.ts):
 * every reservation's `cancelDeadlineAt` is computed at creation as
 * `offer.pickupStartAt - CANCEL_DEADLINE_BEFORE_PICKUP_MS`. That makes the
 * pickup window's START exactly recoverable from `cancelDeadlineAt` alone
 * (`cancelDeadlineAt + 2h`) even though `GET /reservations/mine` doesn't
 * return the offer's pickup window directly — see purchase-cache.ts's doc
 * comment for the full gap this covers. This is a real, cited backend
 * constant, not a guess; if the backend ever changes it, this must move
 * with it (flagged in the task report as a coupling to watch).
 */
export const CANCEL_DEADLINE_BEFORE_PICKUP_MS = 2 * 60 * 60 * 1000;

export function derivePickupStartAt(cancelDeadlineAtIso: string): Date {
  return new Date(
    new Date(cancelDeadlineAtIso).getTime() + CANCEL_DEADLINE_BEFORE_PICKUP_MS,
  );
}
