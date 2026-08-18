/**
 * App-level response types re-exported for readability at call sites
 * (component props, local state, test fixtures) — derived straight from
 * `@kurtar/api-client`'s own (now-correctly-typed) return types, not
 * hand-duplicated copies of the backend DTOs.
 *
 * *** HISTORY — why this file used to be ~270 lines ***
 * This file used to hand-mirror ~15 backend response DTOs field-for-field,
 * with a 27-line header claiming `SuccessBody<P, M>`
 * (`packages/api-client/src/core-types.ts`) collapsed to `never` for every
 * one of the client's 81 operations because openapi-typescript emits
 * response-status keys as NUMERIC literals while the old check compared
 * them against a STRING template-literal pattern. That bug is fixed (see
 * `SuccessBody`'s doc comment and commit e5621a3): every `client.*` call
 * now resolves its real, correct response type on its own —
 * `packages/api-client/dist/domains/*.d.ts` proves it (e.g.
 * `discovery.offers` resolves a concrete `{ items, total, page, pageSize }`
 * shape, not `Promise<never>`). apps/merchant-web and apps/admin-web
 * already completed this same migration (response-types.ts / admin-
 * types.ts, both citing the same commit); this file was the one holdout,
 * still carrying the stale premise and a second, hand-maintained copy of
 * every shape that could silently drift from the real contract again.
 * Every type below is now a straight `Awaited<ReturnType<typeof
 * client...>>` projection instead.
 */

import { client } from "./api-client";

export type BagCategory = "MEAL" | "BAKERY" | "GROCERY" | "PRODUCE" | "OTHER";
export type DietFlag = "VEGETARIAN" | "VEGAN" | "GLUTEN_FREE" | "LACTOSE_FREE";

// ---------------------------------------------------------------------
// Discovery — backend/src/modules/discovery
// ---------------------------------------------------------------------

export type DiscoveryOffersResponse = Awaited<
  ReturnType<typeof client.discovery.offers>
>;
export type DiscoveryOfferItem = DiscoveryOffersResponse["items"][number];
export type DiscoveryOfferTemplate = DiscoveryOfferItem["template"];

export type DiscoveryMapResponse = Awaited<
  ReturnType<typeof client.discovery.map>
>;
export type DiscoveryMapPin = DiscoveryMapResponse[number];

export type DiscoveryStoreProfile = Awaited<
  ReturnType<typeof client.discovery.store>
>;
export type DiscoveryTodaysOffer = DiscoveryStoreProfile["todaysOffers"][number];
/** [I12] storeProfile()'s bagTemplate select also carries
 * allergenDisclaimer — a field the search-list shape (DiscoveryOfferTemplate
 * above) does NOT have, so this is its own type rather than reusing that
 * one. */
export type DiscoveryTodaysOfferTemplate = DiscoveryTodaysOffer["template"];

// ---------------------------------------------------------------------
// Favorites — backend/src/modules/favorites
// ---------------------------------------------------------------------

export type FavoriteListResponse = Awaited<
  ReturnType<typeof client.favorites.listMine>
>;
export type FavoriteListItem = FavoriteListResponse["items"][number];

// ---------------------------------------------------------------------
// Impact — backend/src/modules/impact
// ---------------------------------------------------------------------

export type ImpactTotals = Awaited<ReturnType<typeof client.impact.getMine>>;

// ---------------------------------------------------------------------
// Complaints — backend/src/modules/complaints
// ---------------------------------------------------------------------

export type ComplaintListResponse = Awaited<
  ReturnType<typeof client.complaints.listMine>
>;
export type ComplaintTicket = ComplaintListResponse["items"][number];
export type ComplaintCategory = ComplaintTicket["category"];
export type ComplaintDetail = Awaited<ReturnType<typeof client.complaints.get>>;
export type ComplaintMessage = ComplaintDetail["messages"][number];

// ---------------------------------------------------------------------
// Reservations — backend/src/modules/reservations
// ---------------------------------------------------------------------

export type ReservationListResponse = Awaited<
  ReturnType<typeof client.reservations.listMine>
>;
export type ReservationItem = ReservationListResponse["items"][number];
export type ReservationStatus = ReservationItem["status"];
export type ReservationCreateResponse = Awaited<
  ReturnType<typeof client.reservations.create>
>;
export type ReservationCancelResponse = Awaited<
  ReturnType<typeof client.reservations.cancel>
>;
export type RatingResult = Awaited<ReturnType<typeof client.reservations.rate>>;

// ---------------------------------------------------------------------
// Notification preferences — backend/src/modules/notifications
// ---------------------------------------------------------------------

export type NotificationPreferences = Awaited<
  ReturnType<typeof client.account.notificationPreferences.get>
>;
