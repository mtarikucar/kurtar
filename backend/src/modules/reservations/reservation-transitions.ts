import { ReservationStatus } from "@prisma/client";

/**
 * The complete Reservation state machine. Every status maps to the exact
 * set of statuses it may transition to; anything not listed is denied.
 * Task 4 only ever WRITES a subset of these edges (create -> PENDING_PAYMENT
 * is a fresh row, not a transition; PENDING_PAYMENT/CONFIRMED -> CANCELLED_BY_USER
 * is the cancel endpoint; PENDING_PAYMENT -> CONFIRMED/EXPIRED is the
 * webhook/sweeper settle path; CONFIRMED -> REDEEMED is the redeem
 * endpoint) — CANCELLED_BY_MERCHANT is written by the merchant-cancel /
 * suspend kill-switch fan-out, and CONFIRMED -> NO_SHOW by
 * no-show-sweeper.service.ts once a pickup window has been closed for
 * longer than its grace period. NO_SHOW is not merely cosmetic: a NO_SHOW
 * reservation with a PAID payment settles to the merchant on exactly the
 * same terms as a REDEEMED one (plan §4.3 — a no-show is not refunded and
 * counts as a normal sale), so this edge is a MONEY edge. Nothing may
 * write it with a bare `update`; the sweeper derives its guard from
 * `allowedFromStatusesFor("NO_SHOW")` like every other writer here.
 *
 * Every terminal status transitions to nothing — once a reservation is
 * REDEEMED / CANCELLED_* / NO_SHOW / EXPIRED, it never moves again.
 */
export const RESERVATION_TRANSITIONS: Record<
  ReservationStatus,
  readonly ReservationStatus[]
> = {
  PENDING_PAYMENT: ["CONFIRMED", "EXPIRED", "CANCELLED_BY_USER"],
  CONFIRMED: [
    "REDEEMED",
    "CANCELLED_BY_USER",
    "CANCELLED_BY_MERCHANT",
    "NO_SHOW",
  ],
  REDEEMED: [],
  CANCELLED_BY_USER: [],
  CANCELLED_BY_MERCHANT: [],
  NO_SHOW: [],
  EXPIRED: [],
};

export function isReservationTransitionAllowed(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  return RESERVATION_TRANSITIONS[from].includes(to);
}

/**
 * The inverse of RESERVATION_TRANSITIONS: every status that is allowed to
 * transition INTO `to`. This is what a guarded UPDATE's WHERE clause
 * actually needs ("only move the row if it's currently in one of these
 * starting statuses") — reservations.service.ts and
 * payment-settle.service.ts both derive their compound-WHERE status lists
 * from this function rather than hand-typing them a second time, so the
 * transition table in this file is the single source of truth instead of
 * decorative documentation next to hand-written duplicates that can drift
 * from it silently.
 */
export function allowedFromStatusesFor(
  to: ReservationStatus,
): ReservationStatus[] {
  return (Object.keys(RESERVATION_TRANSITIONS) as ReservationStatus[]).filter(
    (from) => RESERVATION_TRANSITIONS[from].includes(to),
  );
}
