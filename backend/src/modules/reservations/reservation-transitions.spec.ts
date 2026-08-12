import { ReservationStatus } from "@prisma/client";
import {
  RESERVATION_TRANSITIONS,
  isReservationTransitionAllowed,
} from "./reservation-transitions";

const ALL_STATUSES: ReservationStatus[] = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "REDEEMED",
  "CANCELLED_BY_USER",
  "CANCELLED_BY_MERCHANT",
  "NO_SHOW",
  "EXPIRED",
];

// The exact set of edges Task 4 (and the schema's known-future edges)
// expects to be allowed. Every OTHER (from, to) pair among ALL_STATUSES —
// including every self-transition — must be denied. Listing every pair
// explicitly (rather than only the positive cases) is the point of this
// spec: it proves nothing was left implicitly permissive.
const ALLOWED_EDGES = new Set([
  "PENDING_PAYMENT->CONFIRMED",
  "PENDING_PAYMENT->EXPIRED",
  "PENDING_PAYMENT->CANCELLED_BY_USER",
  "CONFIRMED->REDEEMED",
  "CONFIRMED->CANCELLED_BY_USER",
  "CONFIRMED->CANCELLED_BY_MERCHANT",
  "CONFIRMED->NO_SHOW",
]);

describe("RESERVATION_TRANSITIONS — every (from, to) pair, explicitly", () => {
  it.each(
    ALL_STATUSES.flatMap((from) =>
      ALL_STATUSES.map((to): [ReservationStatus, ReservationStatus] => [
        from,
        to,
      ]),
    ),
  )("%s -> %s", (from, to) => {
    const expected = ALLOWED_EDGES.has(`${from}->${to}`);
    expect(isReservationTransitionAllowed(from, to)).toBe(expected);
  });

  it("every terminal status transitions to nothing", () => {
    for (const terminal of [
      "REDEEMED",
      "CANCELLED_BY_USER",
      "CANCELLED_BY_MERCHANT",
      "NO_SHOW",
      "EXPIRED",
    ] as ReservationStatus[]) {
      expect(RESERVATION_TRANSITIONS[terminal]).toEqual([]);
    }
  });

  it("covers every ReservationStatus enum member as a key (nothing silently missing)", () => {
    expect(Object.keys(RESERVATION_TRANSITIONS).sort()).toEqual(
      [...ALL_STATUSES].sort(),
    );
  });
});
