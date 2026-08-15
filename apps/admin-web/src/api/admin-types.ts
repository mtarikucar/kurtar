/**
 * Hand-mirrored response/body shapes for every admin (and admin-adjacent)
 * operation this app calls, because NONE of them come back usefully typed
 * from `@kurtar/api-client` today.
 *
 * *** WHY THIS FILE EXISTS — READ BEFORE EDITING ***
 * Two SEPARATE, stacked problems, both in `packages/api-client`, both out
 * of this task's scope to fix directly (docs/frontend-contract.md §2 —
 * "Touch only apps/admin-web/**"; both flagged prominently in the Task 11
 * report):
 *
 * 1. THE SEVERE ONE — `SuccessBody<P, M>`
 *    (`packages/api-client/src/core-types.ts` lines ~63-76) resolves to
 *    `never` for EVERY operation in the ENTIRE client, not just admin.*.
 *    Root cause: openapi-typescript emits HTTP response maps with NUMERIC
 *    keys (`200: {...}`, `201: {...}`), so `keyof R` is a union of number
 *    literal types — but `SuccessBody` checks `K extends \`2${string}\``,
 *    a template-literal pattern that only ever matches STRING types. A
 *    numeric literal type is never a subtype of any template-literal
 *    string type in TypeScript, so that check is FALSE for every key,
 *    every operation, always — collapsing the whole mapped-and-indexed
 *    type to `never`. Verified empirically two ways: (a) every generated
 *    `.d.ts` under `packages/api-client/dist/domains/*.d.ts` reads
 *    `Promise<never>` for literally every method, including
 *    `health.check()` and the four already-"fully typed" operations named
 *    in docs/frontend-contract.md §9 (`admin.complaints.list/get`,
 *    `admin.getDashboard`, the three CSV exports); (b) a standalone
 *    `tsc` repro (`200 extends \`2${string}\` ? "YES" : "NO"` resolves to
 *    `"NO"`; `"200" extends \`2${string}\`` resolves to `"YES"`) isolates
 *    the exact mismatch. Nothing in `packages/api-client/test/` type-checks
 *    `SuccessBody` itself (only runtime/mocked-fetch behavior is tested),
 *    which is how this shipped unnoticed — every REQUEST/RESPONSE at
 *    runtime is completely correct, this is a compile-time-only defect.
 *    The likely one-line fix: stringify `K` before the check, e.g.
 *    `` `${K & (string | number)}` extends `2${string}` ``.
 *
 * 2. A SEPARATE, SMALLER drift on top of (1) — even if (1) were fixed,
 *    `docs/openapi.json` (the real, committed contract) and the backend
 *    DTOs it's generated from (see the source citations on every type
 *    below) declare full response schemas for every operation in this
 *    file that the COMMITTED `packages/api-client/src/generated/
 *    openapi-types.ts` doesn't yet reference — confirmed by running
 *    `npm run generate -w @kurtar/api-client` locally, which produced an
 *    878-insertion/73-deletion diff against the committed file. That file
 *    was not regenerated after commit 117dd8c ("feat(openapi): typed
 *    response schemas for all 81 operations..."), which added
 *    `@ApiOkResponse`/response-DTO decorators across every admin
 *    controller. This predates Task 11. It will also fail
 *    `.github/workflows/quality-gates.yml`'s `frontend-quality` job (its
 *    first step diffs a fresh regeneration against the committed file).
 *
 * Per docs/frontend-contract.md §9's sanctioned pattern for a genuinely
 * untyped operation ("cast it yourself, in YOUR app code, with a comment
 * naming the real backend source you read to confirm the shape — exactly
 * how the four placeholders already handle HealthController_getHealth"),
 * every type below is copied field-for-field from the real backend
 * response DTO class it cites, not guessed — applied here to EVERY client
 * call this app makes, not just the ones docs/frontend-contract.md §9
 * lists as gaps, because problem (1) above means that list is itself
 * incomplete. Once packages/api-client's `SuccessBody` bug is fixed (and
 * the generated file regenerated), every `client.*` call in this app
 * carries these same shapes natively and every `castAdminResponse()` call
 * site becomes a no-op that can be deleted.
 *
 * Date/DateTime fields are `string` (ISO-8601), matching how
 * openapi-typescript encodes every OTHER `@ApiProperty({ type: Date })`
 * field in this same generated file (e.g. `MembershipMineResponseDto`) —
 * Nest serializes `Date` to a JSON string, it never survives as a `Date`
 * instance over the wire.
 */

import type { AuthTokens } from "@kurtar/api-client";

// ---------------------------------------------------------------------
// Merchants — backend/src/modules/merchants/dto/merchant-response.dto.ts
// ---------------------------------------------------------------------

export type MerchantVerificationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED";

/** AdminMerchantListItemDto */
export interface AdminMerchantListItem {
  id: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  verificationStatus: MerchantVerificationStatus;
  verifiedAt: string | null;
  createdAt: string;
}

/** AdminMerchantListResponseDto — GET /admin/merchants */
export interface AdminMerchantListResponse {
  items: AdminMerchantListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** MerchantTransitionResponseDto — POST /admin/merchants/:id/{approve,reject} */
export interface MerchantTransitionResponse {
  merchantId: string;
  status: MerchantVerificationStatus;
}

/** MerchantSuspendResponseDto — POST /admin/merchants/:id/suspend. The ONLY
 * place a real, non-fabricated "how many offers did this touch" number
 * exists anywhere in the API — there is no pre-click preview endpoint (see
 * MerchantSuspendDialog's doc comment). */
export interface MerchantSuspendResponse {
  merchantId: string;
  status: "SUSPENDED";
  offersCancelled: number;
}

// ---------------------------------------------------------------------
// Settlements — backend/src/modules/settlements/dto/settlement-response.dto.ts
// ---------------------------------------------------------------------

export type SettlementStatus =
  | "PENDING"
  | "CALCULATED"
  | "APPROVED"
  | "SENT"
  | "SETTLED"
  | "FAILED"
  | "HELD";

/** SettlementBatchDto's scalar columns. */
export interface SettlementBatch {
  id: string;
  merchantId: string;
  periodStart: string;
  periodEnd: string;
  status: SettlementStatus;
  grossCents: number;
  bagFeeCents: number;
  bagFeeVatCents: number;
  withholdingCents: number;
  membershipOffsetCents: number;
  membershipOffsetVatCents: number;
  refundClawbackCents: number;
  netPayoutCents: number;
  carriedShortfallCents: number;
  carriedExternalDemandCents: number;
  inheritedExternalDemandCents: number;
  shortfallResolvedAt: string | null;
  payoutAttemptedAt: string | null;
  holdReason: string | null;
  dueAt: string | null;
  pspTransferRef: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  carriedDemandSourceBatchId: string | null;
}

/** AdminSettlementListItemDto — narrower merchant include than detail. */
export interface AdminSettlementListItem extends SettlementBatch {
  merchant: { tradeName: string };
}

/** AdminSettlementListResponseDto — GET /admin/settlements */
export interface AdminSettlementListResponse {
  items: AdminSettlementListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** SettlementLineDto */
export interface SettlementLine {
  id: string;
  batchId: string;
  reservationId: string;
  redeemedAt: string;
  grossCents: number;
  bagFeeCents: number;
  bagFeeVatCents: number;
  withholdingCents: number;
  clawbackCents: number;
  clawbackAppliedAt: string | null;
  clawbackBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** CommissionInvoiceDto */
export interface CommissionInvoice {
  id: string;
  merchantId: string;
  batchId: string | null;
  type: "BAG_FEE" | "MEMBERSHIP";
  docType: "EFATURA" | "EARSIVFATURA";
  nilveraDocId: string | null;
  ublXmlRef: string | null;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
  issuedAt: string | null;
  netAmountCents: number;
  vatCents: number;
  totalAmountCents: number;
  createdAt: string;
  updatedAt: string;
}

/** AdminSettlementDetailResponseDto — GET/approve/hold/retry /admin/settlements/:id
 * (all four return the SAME shape — adminGet(id) called at the end of each). */
export interface AdminSettlementDetail extends SettlementBatch {
  settlementLines: SettlementLine[];
  commissionInvoices: CommissionInvoice[];
  merchant: { tradeName: string; legalName: string; iban: string };
}

// ---------------------------------------------------------------------
// Pricing — backend/src/modules/settlements/dto/settlement-response.dto.ts
// (PlatformPricingDto)
// ---------------------------------------------------------------------

export interface PlatformPricing {
  id: string;
  bagFeeCents: number;
  membershipAnnualCents: number;
  effectiveFrom: string;
}

// ---------------------------------------------------------------------
// Ratings — backend/src/modules/ratings/dto/rating-response.dto.ts
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

// ---------------------------------------------------------------------
// Reports — backend/src/modules/moderation/dto/report-response.dto.ts
// ---------------------------------------------------------------------

export type ReportTargetType = "STORE" | "OFFER" | "RATING";
export type ReportStatus = "OPEN" | "ACTIONED" | "DISMISSED";

/** ContentReportDto — the raw shape returned by action()/dismiss(). */
export interface ContentReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  status: ReportStatus;
  takedownDeadlineAt: string;
  resolvedAt: string | null;
  takedownWarningSentAt: string | null;
  takedownBreachedSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** AdminReportListItemDto — ContentReportDto + a server-computed countdown
 * (negative once the 48h takedown deadline has passed). */
export interface AdminReportListItem extends ContentReport {
  takedownCountdownMs: number;
}

/** AdminReportListResponseDto — GET /admin/reports */
export interface AdminReportListResponse {
  items: AdminReportListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------
// Complaints — backend/src/modules/complaints/dto/complaint-response.dto.ts.
// Every complaints.* operation this app calls needs a cast (see this
// file's header comment, problem 1 — the SuccessBody bug affects these
// too, despite docs/frontend-contract.md §9 listing complaints.list/get
// as "genuinely typed").
// ---------------------------------------------------------------------

export type ComplaintStatus =
  "OPEN" | "MERCHANT_RESPONDED" | "RESOLVED" | "ESCALATED";

/** ComplaintCategory (Prisma enum) — matches AdminListComplaintsQueryDto's
 * `category` filter values exactly (backend/prisma/schema.prisma). */
export type ComplaintCategory =
  | "FOOD_QUALITY"
  | "MISSING_ITEMS"
  | "WRONG_ITEMS"
  | "STORE_CLOSED_NO_SHOW"
  | "RUDE_STAFF"
  | "PAYMENT_BILLING"
  | "SAFETY_HYGIENE"
  | "OTHER";

/** ComplaintTicketDto — POST .../resolve and .../escalate both return this. */
export interface ComplaintTicket {
  id: string;
  userId: string;
  merchantId: string | null;
  reservationId: string | null;
  category: ComplaintCategory;
  description: string;
  status: ComplaintStatus;
  slaDeadlineAt: string;
  resolvedAt: string | null;
  slaWarningSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** AdminComplaintListItemDto — ComplaintTicketDto + a server-computed
 * countdown (negative once the 15-day SLA deadline has passed). */
export interface AdminComplaintListItem extends ComplaintTicket {
  slaCountdownMs: number;
}

/** AdminComplaintListResponseDto — GET /admin/complaints */
export interface AdminComplaintListResponse {
  items: AdminComplaintListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** ComplaintDetailResponseDto — GET /admin/complaints/:id */
export interface ComplaintDetail extends ComplaintTicket {
  messages: ComplaintMessage[];
}

/** ComplaintMessageDto — POST /complaints/:id/messages. */
export interface ComplaintMessage {
  id: string;
  complaintId: string;
  authorType: "CONSUMER" | "MERCHANT" | "ADMIN";
  authorId: string;
  body: string;
  createdAt: string;
}

// ---------------------------------------------------------------------
// Dashboard — backend/src/modules/admin/dto/admin-dashboard-response.dto.ts
// ---------------------------------------------------------------------

export interface AdminDashboardSummary {
  pendingMerchantApprovals: number;
  openComplaints: number;
  complaintsSlaAtRisk: number;
  openReports: number;
  settlementBatchesNeedingAttention: number;
  today: {
    gmvCents: number;
    redeemedCount: number;
  };
}

// ---------------------------------------------------------------------
// Discovery (store target preview for content reports) —
// backend/src/modules/discovery/dto/discovery-response.dto.ts. Only the
// fields TargetPreview.tsx actually reads are mirrored here.
// ---------------------------------------------------------------------

export interface DiscoveryStoreProfile {
  store: {
    id: string;
    name: string;
    address: string;
    district: string;
    city: string;
  };
}

// ---------------------------------------------------------------------
// Admin identity — backend/src/modules/auth/dto/auth-response.dto.ts
// (AdminAuthUserDto). `@kurtar/api-client`'s own `AuthTokens` type
// deliberately omits `user` (see transport.ts's doc comment — the ONE
// override IT makes is token shape, not the per-actor user object), so
// every login call site casts the raw result to this to also read it.
// ---------------------------------------------------------------------

export interface AdminAuthUser {
  id: string;
  email: string;
  name: string;
}

/** AdminAuthResponseDto — what POST /auth/admin/login actually resolves to
 * at runtime: `@kurtar/api-client`'s `auth.adminLogin()` already narrows
 * this down to just `AuthTokens` (accessToken/refreshToken/
 * refreshTokenExpiresAt) at the TYPE level, but the real response object
 * still HAS `user` on it at runtime — this type describes that full shape
 * so `AuthContext` can read `.user` off the same object without a second
 * network call. */
export type AdminLoginResult = AuthTokens & { user: AdminAuthUser };

/** A single, named escape hatch (docs/frontend-contract.md §9) instead of
 * a bare `as T` scattered at every call site — every use of this function
 * is required to sit next to a comment citing which type above it's
 * standing in for and why (see this file's own header comment for the
 * shared "why"). */
export function castAdminResponse<T>(value: unknown): T {
  return value as T;
}
