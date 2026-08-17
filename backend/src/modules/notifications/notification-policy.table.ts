/**
 * The transactional-vs-marketing policy table (brief §4) — encodes, per
 * NotificationKind, whether a send is transactional (bypasses quiet hours
 * AND every marketing/discovery preference) or must respect the
 * recipient's preference + quiet hours. This table is what
 * NotificationPolicyService.mayNotify reads; nowhere else in the codebase
 * branches on "is this transactional" with an ad-hoc if.
 *
 * NotificationKind is intentionally FINER-GRAINED than OutboxEventType:
 * offer.published.v1 fans out through TWO different audiences with two
 * different opt-in preferences (favoriters vs. nearby-radius users), so
 * "one outbox event type -> one policy rule" would conflate them. Each
 * fan-out audience gets its own NotificationKind instead — see
 * modules/outbox/handlers/offer-published.handler.ts.
 */
export type NotificationKind =
  | "OFFER_FAVORITE"
  | "OFFER_NEARBY"
  | "RESERVATION_CONFIRMED"
  | "RESERVATION_CANCELLED_REFUND"
  | "PICKUP_REMINDER"
  | "RATING_INVITE";

export interface NotificationPolicyRule {
  /** Transactional sends IGNORE quiet hours and every preference toggle —
   * per the brief: "reservation confirmed, pickup reminder, offer
   * cancelled -> refund". Only user status (ACTIVE) still applies (see
   * NotificationPolicyService). */
  transactional: boolean;
  /** Which NotificationPreference boolean gates a non-transactional send.
   * Undefined for a non-transactional kind with no dedicated toggle
   * (RATING_INVITE — respects quiet hours but isn't behind
   * favoritesEnabled/nearbyEnabled/marketingEnabled; there is no
   * "invite-me-to-rate" preference in this schema). */
  preferenceField?: "favoritesEnabled" | "nearbyEnabled";
}

export const NOTIFICATION_POLICY_TABLE: Record<
  NotificationKind,
  NotificationPolicyRule
> = {
  OFFER_FAVORITE: { transactional: false, preferenceField: "favoritesEnabled" },
  OFFER_NEARBY: { transactional: false, preferenceField: "nearbyEnabled" },
  RESERVATION_CONFIRMED: { transactional: true },
  RESERVATION_CANCELLED_REFUND: { transactional: true },
  PICKUP_REMINDER: { transactional: true },
  RATING_INVITE: { transactional: false },
};
