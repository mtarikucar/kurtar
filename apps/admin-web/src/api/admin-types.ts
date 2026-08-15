/**
 * A handful of response-shape types re-exported for readability at call
 * sites (component props, local state, test fixtures) — derived straight
 * from `@kurtar/api-client`'s own (now-correctly-typed) return types, not
 * hand-duplicated copies of the backend DTOs.
 *
 * *** HISTORY — why this file used to be much bigger ***
 * This file used to hand-mirror ~20 backend response DTOs field-for-field,
 * plus export a `castAdminResponse<T>(value: unknown): T` escape hatch used
 * at every `client.*` call site in this app. That was a workaround for
 * `SuccessBody<P, M>` (`packages/api-client/src/core-types.ts`) resolving
 * to `never` for every operation in the client — openapi-typescript emits
 * response-status keys as NUMERIC literals, but the old check compared
 * them against a STRING template-literal pattern, which is never true for
 * a number literal. That bug is fixed (see `SuccessBody`'s doc comment and
 * commit e5621a3): every `client.*` call now resolves its real, correct
 * response type on its own, so every `castAdminResponse()` call site was a
 * no-op and has been deleted, and every type below is now a straight
 * `Awaited<ReturnType<typeof client...>>` projection instead of a second,
 * hand-maintained copy that could silently drift from the real contract
 * again.
 *
 * ONE exception, kept hand-written with a narrow, documented cast: see the
 * "Ratings" section below.
 */

import { client } from "./client";

// ---------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------

export type AdminMerchantListResponse = Awaited<
  ReturnType<typeof client.admin.merchants.list>
>;
export type AdminMerchantListItem = AdminMerchantListResponse["items"][number];
export type MerchantVerificationStatus =
  AdminMerchantListItem["verificationStatus"];
export type MerchantTransitionResponse = Awaited<
  ReturnType<typeof client.admin.merchants.approve>
>;
export type MerchantSuspendResponse = Awaited<
  ReturnType<typeof client.admin.merchants.suspend>
>;

// ---------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------

export type AdminSettlementListResponse = Awaited<
  ReturnType<typeof client.admin.settlements.list>
>;
export type AdminSettlementListItem =
  AdminSettlementListResponse["items"][number];
export type SettlementStatus = AdminSettlementListItem["status"];
export type AdminSettlementDetail = Awaited<
  ReturnType<typeof client.admin.settlements.get>
>;

// ---------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------

export type PlatformPricing = Awaited<
  ReturnType<typeof client.admin.pricing.list>
>[number];

// ---------------------------------------------------------------------
// Ratings — backend/src/modules/ratings/dto/rating-response.dto.ts
//
// NOT derived from the client, unlike everything else in this file. The
// COMMITTED `packages/api-client/src/generated/openapi-types.ts` has its
// own, separate drift bug: its `RatingDto` schema is a stale leftover —
// `{ average: number; count: number }` (the shape of an unrelated
// aggregate, `DiscoveryStoreRatingDto`) — from before the ratings module's
// real per-rating `RatingDto` existed. `docs/openapi.json` (the real,
// regenerated, committed contract) has the correct schema (id/
// reservationId/userId/storeId/overallStars/foodQuality/service/comment/
// moderationStatus/createdAt/updatedAt, confirmed against
// backend/src/modules/ratings/dto/rating-response.dto.ts), so this is a
// genuine `packages/api-client` codegen-staleness bug — a DIFFERENT,
// separate defect from the `SuccessBody` `never`-collapse this file used
// to work around, and out of scope for apps/admin-web to fix (it requires
// re-running `npm run generate -w @kurtar/api-client` and committing the
// result). Confirmed by removing the cast here and re-running
// `npm run typecheck -w apps/admin-web`: `RatingsPage.tsx`/`useRatings.ts`
// reading `.id`/`.overallStars`/`.comment`/`.moderationStatus`/`.createdAt`
// off a list item fails against the stale generated `{average,count}`
// shape. Until the generated file is regenerated, `client.admin.ratings.*`
// call sites keep this one hand-written type + the narrow `castAdminResponse`
// below (not a general escape hatch anymore — scoped to exactly this).
// ---------------------------------------------------------------------

export type ModerationStatus = "PENDING" | "APPROVED" | "REJECTED";

/** RatingDto */
export interface Rating {
  id: string;
  reservationId: string;
  userId: string;
  storeId: string;
  overallStars: number;
  foodQuality: number | null;
  service: number | null;
  comment: string | null;
  moderationStatus: ModerationStatus;
  createdAt: string;
  updatedAt: string;
}

/** AdminRatingListResponseDto — GET /admin/ratings */
export interface AdminRatingListResponse {
  items: Rating[];
  total: number;
  page: number;
  pageSize: number;
}

/** Scoped to the ratings staleness issue documented above — see that
 * comment before adding a new use of this. */
export function castAdminResponse<T>(value: unknown): T {
  return value as T;
}

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------

export type AdminReportListResponse = Awaited<
  ReturnType<typeof client.admin.reports.list>
>;
export type AdminReportListItem = AdminReportListResponse["items"][number];
export type ReportStatus = AdminReportListItem["status"];
export type ReportTargetType = AdminReportListItem["targetType"];
export type ContentReport = Awaited<
  ReturnType<typeof client.admin.reports.action>
>;

// ---------------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------------

export type AdminComplaintListResponse = Awaited<
  ReturnType<typeof client.admin.complaints.list>
>;
export type AdminComplaintListItem =
  AdminComplaintListResponse["items"][number];
export type ComplaintStatus = AdminComplaintListItem["status"];
export type ComplaintCategory = AdminComplaintListItem["category"];
export type ComplaintTicket = Awaited<
  ReturnType<typeof client.admin.complaints.resolve>
>;
export type ComplaintDetail = Awaited<
  ReturnType<typeof client.admin.complaints.get>
>;
export type ComplaintMessage = Awaited<
  ReturnType<typeof client.complaints.addMessage>
>;

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

export type AdminDashboardSummary = Awaited<
  ReturnType<typeof client.admin.getDashboard>
>;

// ---------------------------------------------------------------------
// Discovery (store target preview for content reports)
// ---------------------------------------------------------------------

export type DiscoveryStoreProfile = Awaited<
  ReturnType<typeof client.discovery.store>
>;

// ---------------------------------------------------------------------
// Admin identity
// ---------------------------------------------------------------------

/** `client.auth.adminLogin()`'s real resolved return type is
 * `AdminAuthResponseDto` (accessToken/refreshToken?/refreshTokenExpiresAt/
 * user) — a richer, actor-specific type than `@kurtar/api-client`'s shared
 * `AuthTokens` alias (see `packages/api-client/src/transport.ts`'s doc
 * comment: `AuthTokens` is only the fields every token-issuing operation
 * has in COMMON; `adminLogin` carries its own operation-specific response
 * schema, which does include `user`). So, unlike the rest of this file's
 * old contents, this never actually needed a cast once the `SuccessBody`
 * bug was fixed — `.user` was always there natively. */
export type AdminLoginResult = Awaited<
  ReturnType<typeof client.auth.adminLogin>
>;
export type AdminAuthUser = AdminLoginResult["user"];
