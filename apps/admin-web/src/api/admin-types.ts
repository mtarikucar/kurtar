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
/** [I7 fix] The audited KYC-detail read (docsJson, IBAN, verification
 * history) — what an approver needs to actually judge a submission. */
export type AdminMerchantDetail = Awaited<
  ReturnType<typeof client.admin.merchants.get>
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
// ---------------------------------------------------------------------

export type ModerationStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AdminRatingListResponse = Awaited<
  ReturnType<typeof client.admin.ratings.list>
>;
export type Rating = AdminRatingListResponse["items"][number];

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
