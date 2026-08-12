import { ReservationStatus } from "@prisma/client";

/**
 * The complete Reservation state machine. Every status maps to the exact
 * set of statuses it may transition to; anything not listed is denied.
 * Task 4 only ever WRITES a subset of these edges (create -> PENDING_PAYMENT
 * is a fresh row, not a transition; PENDING_PAYMENT/CONFIRMED -> CANCELLED_BY_USER
 * is the cancel endpoint; PENDING_PAYMENT -> CONFIRMED/EXPIRED is the
 * webhook/sweeper settle path; CONFIRMED -> REDEEMED is the redeem
 * endpoint) — CANCELLED_BY_MERCHANT and NO_SHOW have no endpoint yet, but
 * are still valid FUTURE edges from CONFIRMED per the schema's enum, so
 * they're declared here rather than left implicit.
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
