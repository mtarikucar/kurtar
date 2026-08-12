import { OfferStatus } from "@prisma/client";

/**
 * The DailyOffer.status state machine that OffersService's guarded
 * updates derive from — same pattern as
 * reservations/reservation-transitions.ts and
 * merchants/merchant-verification-transitions.ts (Task 4's I4 finding:
 * the map must BE the enforcement, not documentation next to a hand-typed
 * duplicate).
 *
 * PUBLISHED <-> SOLD_OUT is deliberately NOT represented here: that edge
 * is owned entirely by OfferStockService.claim/release's own raw-SQL CASE
 * expression (modules/reservations/offer-stock.service.ts), not by any
 * guarded updateMany in this module. Including it would let
 * allowedFromStatusesFor("PUBLISHED") — the publish endpoint's own guard —
 * accidentally also match a SOLD_OUT row, letting a merchant "publish" a
 * sold-out offer through this module's endpoint instead of through a real
 * stock release. Keeping this map scoped to the transitions THIS module
 * actually performs avoids that.
 */
export const OFFER_TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
  DRAFT: ["SCHEDULED", "PUBLISHED", "CANCELLED"],
  SCHEDULED: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["CLOSED", "CANCELLED"],
  SOLD_OUT: ["CLOSED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

export function isOfferTransitionAllowed(
  from: OfferStatus,
  to: OfferStatus,
): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

/**
 * The inverse of OFFER_TRANSITIONS: every status allowed to transition
 * INTO `to` — exactly what a guarded UPDATE's WHERE clause needs.
 * offers.service.ts derives every compound-WHERE status list from this
 * function:
 *   - allowedFromStatusesFor("PUBLISHED")  -> [DRAFT, SCHEDULED]     (publish)
 *   - allowedFromStatusesFor("SCHEDULED")  -> [DRAFT]                (schedule)
 *   - allowedFromStatusesFor("CLOSED")     -> [PUBLISHED, SOLD_OUT]  (close)
 *   - allowedFromStatusesFor("CANCELLED")  -> [DRAFT, SCHEDULED, PUBLISHED, SOLD_OUT] (cancel)
 */
export function allowedFromStatusesFor(to: OfferStatus): OfferStatus[] {
  return (Object.keys(OFFER_TRANSITIONS) as OfferStatus[]).filter((from) =>
    OFFER_TRANSITIONS[from].includes(to),
  );
}
