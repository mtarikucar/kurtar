/**
 * Versioned outbox event-type catalog — the single source of truth for
 * every dotted event-type string this codebase writes or reads. Every
 * producer (offers.service.ts, reservations.service.ts,
 * payment-settle.service.ts, merchants.service.ts) and every handler
 * (modules/outbox/handlers/*) imports its type from here rather than
 * hand-typing the string a second time, so a typo can never silently
 * create an event nothing listens for for (or a handler that never
 * matches anything a producer actually emits).
 *
 * "v1" is part of the string deliberately — a future breaking payload
 * change ships as a new "v2" type with its own handler, never a silent
 * reshape of what "v1" means to whatever is already queued.
 */
export const OUTBOX_EVENT_TYPES = {
  OFFER_PUBLISHED_V1: "offer.published.v1",
  OFFER_CANCELLED_V1: "offer.cancelled.v1",
  // [Fix round 2, moderate finding] Split out from offer.cancelled.v1 —
  // that one event used to drive BOTH the consumer push and the merchant
  // email via one Promise.allSettled-then-rethrow handler. Combined with
  // the Important-6 fix (email throw-on-false), a persistently-failing
  // email retried the WHOLE handler up to MAX_OUTBOX_ATTEMPTS times,
  // re-sending the consumer "your money is being refunded" push on every
  // retry even though it had already succeeded. Two independent events,
  // each with its own handler and its own retry/backoff/DEAD lifecycle,
  // closes that: a stuck email retries only the email.
  OFFER_CANCELLED_MERCHANT_EMAIL_V1: "offer.cancelled.merchant-email.v1",
  RESERVATION_CONFIRMED_V1: "reservation.confirmed.v1",
  RESERVATION_REDEEMED_V1: "reservation.redeemed.v1",
  // [Task 9] A SECOND, independent event for the exact same redeem
  // instant reservation.redeemed.v1 already covers — NOT reused, for the
  // identical one-handler-per-type reason OFFER_CANCELLED_MERCHANT_EMAIL_V1/
  // MERCHANT_APPROVED_MEMBERSHIP_V1 were split out (see their own doc
  // comments): reservation.redeemed.v1 is already ReservationRedeemedHandler's
  // (the rating-invite push, scheduled +2h). This drives
  // modules/impact's ImpactLedger write instead — a different concern
  // with its own idempotency/retry needs (must fire immediately, not
  // +2h), published in the SAME transaction as reservation.redeemed.v1.
  RESERVATION_REDEEMED_IMPACT_V1: "reservation.redeemed.impact.v1",
  MERCHANT_APPROVED_V1: "merchant.approved.v1",
  MERCHANT_REJECTED_V1: "merchant.rejected.v1",
  MERCHANT_SUSPENDED_V1: "merchant.suspended.v1",
  // [Task 8] A SECOND, independent event for the exact same APPROVED
  // transition merchant.approved.v1 already covers — NOT reused, because
  // OutboxHandlerRegistry is one-handler-per-type (register() overwrites
  // on a collision, "the later registration wins" — see its own doc
  // comment); merchant.approved.v1 is already MerchantStatusEmailHandler's.
  // This mirrors OFFER_CANCELLED_MERCHANT_EMAIL_V1's split above exactly:
  // two events, each with its own handler and retry/backoff lifecycle,
  // both published in the SAME transaction as the APPROVED status change
  // (merchants.service.ts's transition()).
  MERCHANT_APPROVED_MEMBERSHIP_V1: "merchant.approved.membership.v1",
  // [Task 8] Emitted in the SAME transaction that flips a SettlementBatch
  // APPROVED -> SENT (settlement-payout.service.ts) — the transactional-
  // outbox guarantee this file's own doc comment describes, applied to a
  // payout instead of a reservation/offer state change. Drives the
  // merchant "payout-sent" email (Task 7 left the template unwired —
  // outbox/handlers/settlement-sent-email.handler.ts).
  SETTLEMENT_BATCH_SENT_V1: "settlement.batch.sent.v1",
  // [Task 8] The commission-invoice-drafting sibling of the event above —
  // same one-handler-per-type reasoning as MERCHANT_APPROVED_MEMBERSHIP_V1;
  // both published together by the same markSent() transaction.
  SETTLEMENT_BATCH_SENT_INVOICE_V1: "settlement.batch.sent.invoice.v1",
} as const;

export type OutboxEventType =
  (typeof OUTBOX_EVENT_TYPES)[keyof typeof OUTBOX_EVENT_TYPES];

// ---- Payload contracts, one per event type -------------------------------
// Every field a handler needs is either cheap-and-stable (ids, timestamps,
// counts) or itself the thing consumers must never lose track of even if
// the source row changes later (e.g. offer.cancelled.v1's reservationIds —
// which reservations this SPECIFIC cancellation affected, not "whatever
// the offer's reservations look like by the time the handler runs").
// Anything else a handler wants for message copy (store name, merchant
// email) is looked up fresh at dispatch time — see the handlers themselves.

export interface OfferPublishedV1Payload {
  offerId: string;
  storeId: string;
  bagTemplateId: string;
  publishedAt: string;
}

export interface OfferCancelledV1Payload {
  offerId: string;
  storeId: string;
  /** Reservations this cancellation moved CONFIRMED -> CANCELLED_BY_MERCHANT
   * (i.e. exactly the ones being refunded) — the audience for the
   * "your money is being refunded" push. Deliberately excludes the
   * expiredCount PENDING_PAYMENT ones: those were never charged, so
   * there is nothing to refund and a different message (if any) would
   * apply. */
  reservationIds: string[];
}

/** [Fix round 2] The merchant-email half of an offer cancellation — split
 * from OfferCancelledV1Payload (see OUTBOX_EVENT_TYPES's doc comment) so
 * the email leg retries independently of the consumer-push leg. */
export interface OfferCancelledMerchantEmailV1Payload {
  offerId: string;
  storeId: string;
  expiredCount: number;
  cancelledCount: number;
  reason: string;
}

export interface ReservationConfirmedV1Payload {
  reservationId: string;
  userId: string;
  storeId: string;
  offerId: string;
  code: string;
  pickupStartAt: string;
  pickupEndAt: string;
}

export interface ReservationRedeemedV1Payload {
  reservationId: string;
  userId: string;
  storeId: string;
}

/** [Task 9] Everything ImpactLedgerHandler needs to compute mealsSaved/
 * co2eGrams/moneySavedCents WITHOUT a second query back to the
 * reservation/offer/bagTemplate chain — copied at publish time (same
 * "cheap-and-stable" rationale as every other payload in this file),
 * since the underlying rows could in principle change shape before a
 * retried dispatch runs. */
export interface ReservationRedeemedImpactV1Payload {
  reservationId: string;
  userId: string;
  storeId: string;
  qty: number;
  totalCents: number;
  originalValueCentsMin: number;
  originalValueCentsMax: number;
}

export interface MerchantStatusV1Payload {
  merchantId: string;
  note?: string;
}

/** [Task 8] merchant.approved.membership.v1's payload — deliberately just
 * the id; the handler reads merchant.verifiedAt fresh (see
 * MembershipApprovedHandler's own doc comment on why). */
export interface MerchantApprovedMembershipV1Payload {
  merchantId: string;
}

/** [Task 8] periodStart/End and netPayoutCents are copied at publish time
 * (not re-read from the batch by handlers) so the email/invoice handlers
 * never need a second query just to know what to SAY — the same
 * "cheap-and-stable" rationale this file's top comment gives for every
 * other payload here. */
export interface SettlementBatchSentV1Payload {
  batchId: string;
  merchantId: string;
  periodStart: string;
  periodEnd: string;
  netPayoutCents: number;
  pspTransferRef: string;
}
