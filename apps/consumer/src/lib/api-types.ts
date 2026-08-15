/**
 * App-level response types for every operation this app calls.
 *
 * ALL hand-typed here, none derived from `@kurtar/api-client`'s
 * `SuccessBody<path, method>` helper — a CRITICAL bug found while wiring
 * this up: `packages/api-client/src/core-types.ts`'s `SuccessBody` filters
 * response keys with `K extends \`2${string}\`` (a STRING template-literal
 * check), but `openapi-typescript` emits HTTP status codes as NUMERIC
 * literal keys (`200: {...}`, not `"200": {...}` — confirmed by direct
 * inspection: `operations["DiscoveryController_offers"]["responses"][200]`
 * resolves to the real response shape, while the `SuccessBody` mapped type
 * itself resolves to `never` for that exact same operation). A number
 * literal type never extends a string template-literal type, so EVERY key
 * in EVERY operation's `responses` object fails that check and
 * `SuccessBody<P, M>` collapses to `never` for ALL 81 operations —
 * regardless of whether the backend declared a real response schema or
 * not. This is not specific to a handful of "known gap" operations (see
 * docs/frontend-contract.md §9): it silently defeats typed responses
 * client-wide, for every one of the four frontend apps that import this
 * package. Flagged prominently in the task report — packages/api-client is
 * out of this app's scope to edit, and this is exactly the kind of "genuine
 * bug, don't patch around it silently" case docs/frontend-contract.md
 * calls out. Every type below is instead read directly from the real
 * backend response DTO (cited per type) — the SAME sanctioned pattern the
 * placeholder health-check code already used for a genuinely undocumented
 * response, just applied here because the generated helper turned out to
 * be unusable rather than merely incomplete.
 */

export type BagCategory = "MEAL" | "BAKERY" | "GROCERY" | "PRODUCE" | "OTHER";
export type DietFlag = "VEGETARIAN" | "VEGAN" | "GLUTEN_FREE" | "LACTOSE_FREE";

/** backend/src/modules/discovery/dto/discovery-offers-response.dto.ts */
export interface DiscoveryOfferTemplate {
  title: string;
  category: string;
  dietFlags: string[];
  priceCents: number;
  originalValueCentsMin: number;
  originalValueCentsMax: number;
}

export interface DiscoveryOfferItem {
  offerId: string;
  store: { id: string; name: string; district: string; distanceM: number };
  template: DiscoveryOfferTemplate;
  pickupStartAt: string;
  pickupEndAt: string;
  qtyLeft: number;
  coverImageUrl: string | null;
}

export interface DiscoveryOffersResponse {
  items: DiscoveryOfferItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DiscoveryMapPin {
  storeId: string;
  lat: number;
  lng: number;
  minPriceCents: number;
  offersCount: number;
}

export type DiscoveryMapResponse = DiscoveryMapPin[];

export interface DiscoveryTodaysOffer {
  offerId: string;
  template: DiscoveryOfferTemplate;
  pickupStartAt: string;
  pickupEndAt: string;
  qtyLeft: number;
}

export interface DiscoveryStoreProfile {
  store: {
    id: string;
    name: string;
    address: string;
    district: string;
    city: string;
    coverImageUrl: string | null;
    categoryTags: string[];
    openingHoursJson: unknown;
  };
  todaysOffers: DiscoveryTodaysOffer[];
  rating: { average: number; count: number };
}

/** backend/src/modules/favorites/dto/favorite-list-response.dto.ts */
export interface FavoriteListItem {
  storeId: string;
  favoritedAt: string;
  store: {
    id: string;
    name: string;
    district: string;
    city: string;
    coverImageUrl: string | null;
    avgStars: number;
    ratingCount: number;
    active: boolean;
  };
  hasLiveOfferToday: boolean;
}

export interface FavoriteListResponse {
  items: FavoriteListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** backend/src/modules/impact/dto/impact-response.dto.ts */
export interface ImpactTotals {
  mealsSaved: number;
  co2eGrams: number;
  moneySavedCents: number;
  count: number;
}

/** backend/src/modules/complaints/dto/complaint-response.dto.ts */
export type ComplaintCategory =
  | "FOOD_QUALITY"
  | "MISSING_ITEMS"
  | "WRONG_ITEMS"
  | "STORE_CLOSED_NO_SHOW"
  | "RUDE_STAFF"
  | "PAYMENT_BILLING"
  | "SAFETY_HYGIENE"
  | "OTHER";

export interface ComplaintTicket {
  id: string;
  userId: string;
  merchantId: string | null;
  reservationId: string | null;
  category: ComplaintCategory;
  description: string;
  status: "OPEN" | "MERCHANT_RESPONDED" | "RESOLVED" | "ESCALATED";
  slaDeadlineAt: string;
  resolvedAt: string | null;
  slaWarningSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintListResponse {
  items: ComplaintTicket[];
  total: number;
  page: number;
  pageSize: number;
}

/** The 7 states `Reservation.status` can be in — from
 * backend/prisma/schema.prisma's `ReservationStatus` enum. */
export type ReservationStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "REDEEMED"
  | "CANCELLED_BY_USER"
  | "CANCELLED_BY_MERCHANT"
  | "NO_SHOW"
  | "EXPIRED";

/** backend/src/modules/reservations/dto/reservation-response.dto.ts's
 * `ReservationDto` (the raw Reservation Prisma model, scalar columns
 * only; Date fields arrive as ISO strings over JSON). */
export interface ReservationItem {
  id: string;
  code: string;
  userId: string;
  offerId: string;
  storeId: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  status: ReservationStatus;
  cancelDeadlineAt: string;
  redeemedAt: string | null;
  redeemedByMerchantUserId: string | null;
  pickupReminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `ReservationListResponseDto`. This app's worktree forked from commit
 * 117dd8c, whose committed `reservation-response.dto.ts` names this field
 * `limit` (documented there as a deliberate, known inconsistency vs. every
 * other paginated envelope's `pageSize`). Live verification against the
 * shared dev backend (2026-08-15, see the task report's verification
 * section) showed the ACTUAL running `GET /reservations/mine` response
 * uses `pageSize` — i.e. the rename that progress.md records as "dispatched
 * … before merchant-web is built on" has already landed on whatever
 * commit that backend is running, ahead of this worktree's frozen base.
 * Typed to match the verified-live shape; this field isn't read anywhere
 * in this app (grepped), so the choice is zero-risk either way. */
export interface ReservationListResponse {
  items: ReservationItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** `ReservationCreateResponseDto`/`ReservationPaymentDto`. */
export interface ReservationCreateResponse {
  reservationId: string;
  code: string;
  totalCents: number;
  payment: { merchantOid: string; redirectUrl?: string };
}

/** `ReservationCancelResponseDto`. */
export interface ReservationCancelResponse {
  reservationId: string;
  status: ReservationStatus;
}

/** backend/src/modules/ratings/dto/rating-response.dto.ts's `RatingDto`
 * (the raw Rating model — what `POST /reservations/:id/rating` returns
 * unmodified). */
export interface RatingResult {
  id: string;
  reservationId: string;
  userId: string;
  storeId: string;
  overallStars: number;
  foodQuality: number | null;
  service: number | null;
  comment: string | null;
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
}

/** backend/src/modules/notifications/dto/notification-preference-response.dto.ts's
 * `NotificationPreferenceDto` (the raw NotificationPreference model —
 * both GET and PATCH return it unmodified). */
export interface NotificationPreferences {
  id: string;
  userId: string;
  favoritesEnabled: boolean;
  nearbyEnabled: boolean;
  nearbyRadiusM: number;
  marketingEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  createdAt: string;
  updatedAt: string;
}
