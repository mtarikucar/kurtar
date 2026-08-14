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
  RESERVATION_CONFIRMED_V1: "reservation.confirmed.v1",
  RESERVATION_REDEEMED_V1: "reservation.redeemed.v1",
  MERCHANT_APPROVED_V1: "merchant.approved.v1",
  MERCHANT_REJECTED_V1: "merchant.rejected.v1",
  MERCHANT_SUSPENDED_V1: "merchant.suspended.v1",
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
  expiredCount: number;
  cancelledCount: number;
  reason: string;
  /** Reservations this cancellation moved CONFIRMED -> CANCELLED_BY_MERCHANT
   * (i.e. exactly the ones being refunded) — the audience for the
   * "your money is being refunded" push. Deliberately excludes the
   * expiredCount ones (PENDING_PAYMENT -> EXPIRED): those were never
   * charged, so there is nothing to refund and a different message (if
   * any) would apply. */
  reservationIds: string[];
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

export interface MerchantStatusV1Payload {
  merchantId: string;
  note?: string;
}
