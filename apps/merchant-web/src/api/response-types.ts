/**
 * Hand-typed response shapes for @kurtar/api-client operations whose
 * generated TypeScript return type does not match the real wire contract.
 *
 * WHY THIS FILE EXISTS (read before adding to it). Per docs/frontend-
 * contract.md §9, `packages/api-client/src/generated/openapi-types.ts` is
 * generated from the COMMITTED `docs/openapi.json` — never hand-edited.
 * `git log` on that generated file shows it was last produced at commit
 * 8ca095e (the initial workspace scaffold). `docs/openapi.json` itself has
 * moved on since — commits 413f816 and 117dd8c ("typed response schemas
 * for all 81 operations") added real `@ApiOkResponse`/`@ApiCreatedResponse`
 * DTOs to nearly every merchant-facing controller. Reading
 * `docs/openapi.json` directly confirms the SPEC already has the real
 * schema for, e.g., `GET /api/bag-templates` (`BagTemplateDto[]`) — but the
 * generated TS file was never re-run against that updated spec, so
 * `SuccessBody<...>` for most of these operations still resolves to `void`
 * or `Record<string, never>` in `@kurtar/api-client` even though the wire
 * contract is fully typed today.
 *
 * This is a genuine bug in the shared package (a stale generated artifact,
 * not a documentation gap) — flagged in this task's report rather than
 * fixed here, since `packages/api-client/**` is outside this task's
 * directory scope (`apps/merchant-web/**` only) and three other app tasks
 * build on the same package in parallel. The fix is one command
 * (`npm run generate -w @kurtar/api-client`, which reads the already-
 * correct `docs/openapi.json` — no backend change needed) but belongs to
 * whoever owns that package, not a silent per-app workaround.
 *
 * Until then, every type below follows the sanctioned fallback from
 * frontend-contract.md §9, option 1: hand-typed here, field-for-field from
 * the REAL backend response DTO (named in each comment), never guessed —
 * exactly the pattern the placeholder App.tsx already used for
 * `HealthController_getHealth`.
 */

/** Narrows a not-yet-fully-typed api-client response to its real shape —
 * see the file doc comment above for why this is needed instead of the
 * type flowing through automatically. */
export function asResponse<T>(value: unknown): T {
  return value as T;
}

// ---- merchants (backend/src/modules/merchants/dto/merchant-response.dto.ts) ----

export type MerchantVerificationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED";

/** MerchantSignupResponseDto (extends AuthTokensDto) */
export interface MerchantSignupResponse {
  accessToken: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  merchant: { id: string; verificationStatus: MerchantVerificationStatus };
}

/** MerchantSubmitResponseDto */
export interface MerchantSubmitResponse {
  merchantId: string;
  status: "SUBMITTED";
}

/** MerchantMeStoreSummaryDto, folded into MerchantMeResponseDto below */
export interface MerchantMeStoreSummary {
  id: string;
  name: string;
  city: string;
  district: string;
  active: boolean;
}

/** MerchantMeResponseDto */
export interface MerchantMe {
  id: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  iban: string;
  verificationStatus: MerchantVerificationStatus;
  verifiedAt: string | null;
  nextReverifyAt: string | null;
  sttAttestationAcceptedAt: string | null;
  intermediationAcceptedAt: string | null;
  intermediationContractVersion: string | null;
  createdAt: string;
  stores: MerchantMeStoreSummary[];
}

// ---- memberships (backend/src/modules/memberships/dto/membership-response.dto.ts) ----

export type MembershipStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED";

/** MembershipMineResponseDto */
export interface MembershipMine {
  status: MembershipStatus;
  anchorDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  priceCents: number;
  vatCents: number;
  outstandingCents: number;
  outstandingVatCents: number;
  writtenOffCents: number;
  periodPaidAt: string | null;
  nextAnniversary: string;
}

// ---- stores (backend/src/modules/stores/dto/store-response.dto.ts) ----

export type BagCategory = "MEAL" | "BAKERY" | "GROCERY" | "PRODUCE" | "OTHER";

/** StoreDto */
export interface Store {
  id: string;
  merchantId: string;
  name: string;
  address: string;
  district: string;
  city: string;
  latitude: number;
  longitude: number;
  coverImageUrl: string | null;
  categoryTags: BagCategory[];
  openingHoursJson: unknown;
  active: boolean;
  avgStars: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---- bag templates (backend/src/modules/offers/dto/bag-template-response.dto.ts) ----

export type DietFlag = "VEGETARIAN" | "VEGAN" | "GLUTEN_FREE" | "LACTOSE_FREE";

/** BagTemplateDto */
export interface BagTemplate {
  id: string;
  storeId: string;
  title: string;
  category: BagCategory;
  dietFlags: DietFlag[];
  allergenDisclaimer: string;
  originalValueCentsMin: number;
  originalValueCentsMax: number;
  priceCents: number;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- offers (backend/src/modules/offers/dto/offer-response.dto.ts) ----

export type OfferStatus =
  "DRAFT" | "SCHEDULED" | "PUBLISHED" | "SOLD_OUT" | "CLOSED" | "CANCELLED";

/** DailyOfferDto — returned by POST /offers */
export interface DailyOffer {
  id: string;
  bagTemplateId: string;
  storeId: string;
  offerDate: string;
  qtyTotal: number;
  qtyReserved: number;
  qtyRedeemed: number;
  pickupStartAt: string;
  pickupEndAt: string;
  status: OfferStatus;
  publishAt: string | null;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** OfferMineItemDto — returned by GET /offers/mine */
export interface OfferMineItem {
  id: string;
  storeId: string;
  storeName: string;
  bagTemplateId: string;
  title: string;
  priceCents: number;
  offerDate: string;
  status: OfferStatus;
  qtyTotal: number;
  qtyReserved: number;
  qtyRedeemed: number;
  qtyLeft: number;
  pickupStartAt: string;
  pickupEndAt: string;
}

/** OfferPublishResponseDto */
export interface OfferPublishResponse {
  offerId: string;
  status: "PUBLISHED";
  publishedAt: string;
}

/** OfferScheduleResponseDto */
export interface OfferScheduleResponse {
  offerId: string;
  status: "SCHEDULED";
  publishAt: string;
}

/** OfferCloseResponseDto */
export interface OfferCloseResponse {
  offerId: string;
  status: "CLOSED";
}

/** OfferCancelResponseDto */
export interface OfferCancelResponse {
  offerId: string;
  status: "CANCELLED";
  expiredCount: number;
  cancelledCount: number;
  refundResults: Array<{
    reservationId: string;
    ok: boolean;
    refundRef?: string;
    error?: string;
  }>;
}

// ---- settlements (backend/src/modules/settlements/dto/settlement-response.dto.ts) ----

export type SettlementStatus =
  | "PENDING"
  | "CALCULATED"
  | "APPROVED"
  | "SENT"
  | "SETTLED"
  | "FAILED"
  | "HELD";

/** SettlementBatchDto's scalar columns */
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

/** SettlementListResponseDto */
export interface SettlementListResponse {
  items: SettlementBatch[];
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
  linesJson: unknown;
  createdAt: string;
  updatedAt: string;
}

/** SettlementDetailResponseDto (extends SettlementBatchDto) */
export interface SettlementDetail extends SettlementBatch {
  settlementLines: SettlementLine[];
  commissionInvoices: CommissionInvoice[];
}

// ---- ratings (backend/src/modules/ratings/dto/rating-response.dto.ts) ----

export type ModerationStatus = "PENDING" | "APPROVED" | "REJECTED";

/** RatingsMineItemDto */
export interface RatingsMineItem {
  id: string;
  overallStars: number;
  foodQuality: number | null;
  service: number | null;
  comment: string | null;
  moderationStatus: ModerationStatus;
  createdAt: string;
}

/** RatingDistributionDto */
export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

/** RatingsMineResponseDto */
export interface RatingsMineResponse {
  storeId: string;
  avgStars: number;
  ratingCount: number;
  distribution: RatingDistribution;
  pendingCount: number;
  items: RatingsMineItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- complaints (backend/src/modules/complaints/dto/complaint-response.dto.ts) ----

export type ComplaintCategory =
  | "FOOD_QUALITY"
  | "MISSING_ITEMS"
  | "WRONG_ITEMS"
  | "STORE_CLOSED_NO_SHOW"
  | "RUDE_STAFF"
  | "PAYMENT_BILLING"
  | "SAFETY_HYGIENE"
  | "OTHER";

export type ComplaintStatus =
  "OPEN" | "MERCHANT_RESPONDED" | "RESOLVED" | "ESCALATED";

/** ComplaintTicketDto */
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

/** ComplaintMessageDto */
export interface ComplaintMessage {
  id: string;
  complaintId: string;
  authorType: "CONSUMER" | "MERCHANT" | "ADMIN";
  authorId: string;
  body: string;
  createdAt: string;
}

/** ComplaintListResponseDto */
export interface ComplaintListResponse {
  items: ComplaintTicket[];
  total: number;
  page: number;
  pageSize: number;
}

/** ComplaintDetailResponseDto (extends ComplaintTicketDto) */
export interface ComplaintDetail extends ComplaintTicket {
  messages: ComplaintMessage[];
}

// ---- reservations (backend/src/modules/reservations/dto/reservation-response.dto.ts) ----

/** ReservationRedeemResponseDto */
export interface ReservationRedeemResponse {
  reservationId: string;
  status: "REDEEMED";
  redeemedAt: string;
}
