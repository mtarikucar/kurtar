import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MerchantVerificationStatus } from "@prisma/client";
import { AuthTokensDto } from "../../auth/dto/auth-response.dto";

/** [Contract completion] Response shapes for MerchantsService — derived
 * field-for-field from each method's actual return statement, not the
 * full Merchant Prisma model (several of these narrow via `select`). */

export class MerchantSignupMerchantDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MerchantVerificationStatus })
  verificationStatus!: MerchantVerificationStatus;
}

/** POST /merchants/signup — MerchantSignupResult extends IssuedTokens.
 * [Security fix] Now routes through the SAME
 * respondWithTokens()/wantsCookieOnlyTransport() convention as the
 * /auth/* login endpoints (refresh-cookie-transport.util.ts) — a
 * merchant-web caller declaring `X-Client-Transport: cookie` gets the
 * refresh token ONLY as an httpOnly cookie, stripped from this body,
 * exactly like /auth/otp/verify and the /auth login endpoints. AuthTokensDto's own
 * `refreshToken`/`refreshTokenExpiresAt` are already optional for
 * exactly this reason — see its doc comment. */
export class MerchantSignupResponseDto extends AuthTokensDto {
  @ApiProperty({ type: MerchantSignupMerchantDto })
  merchant!: MerchantSignupMerchantDto;
}

/** POST /merchants/me/submit */
export class MerchantSubmitResponseDto {
  @ApiProperty() merchantId!: string;
  @ApiProperty({ enum: ["SUBMITTED"] }) status!: "SUBMITTED";
}

export class MerchantMeStoreSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() city!: string;
  @ApiProperty() district!: string;
  @ApiProperty() active!: boolean;
}

/** GET /merchants/me */
export class MerchantMeResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() legalName!: string;
  @ApiProperty() tradeName!: string;
  @ApiProperty() taxId!: string;
  @ApiProperty() iban!: string;
  @ApiProperty({ enum: MerchantVerificationStatus })
  verificationStatus!: MerchantVerificationStatus;
  @ApiPropertyOptional({ nullable: true, type: Date }) verifiedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  nextReverifyAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  sttAttestationAcceptedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  intermediationAcceptedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  intermediationContractVersion!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: [MerchantMeStoreSummaryDto] })
  stores!: MerchantMeStoreSummaryDto[];
}

/** POST /admin/merchants/:id/approve|reject — MerchantsService's private
 * transition() return shape. */
export class MerchantTransitionResponseDto {
  @ApiProperty() merchantId!: string;
  @ApiProperty({ enum: MerchantVerificationStatus })
  status!: MerchantVerificationStatus;
}

/** POST /admin/merchants/:id/suspend — MerchantSuspendResult. */
export class MerchantSuspendResponseDto {
  @ApiProperty() merchantId!: string;
  @ApiProperty({ enum: ["SUSPENDED"] }) status!: "SUSPENDED";
  @ApiProperty() offersCancelled!: number;
}

/** GET /admin/merchants — MerchantsService.adminList's `select`-narrowed
 * item shape (id/legalName/tradeName/taxId/verificationStatus/verifiedAt/
 * createdAt only — NOT the full Merchant model: iban/stores/etc are
 * deliberately not selected for the list view). */
export class AdminMerchantListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() legalName!: string;
  @ApiProperty() tradeName!: string;
  @ApiProperty() taxId!: string;
  @ApiProperty({ enum: MerchantVerificationStatus })
  verificationStatus!: MerchantVerificationStatus;
  @ApiPropertyOptional({ nullable: true, type: Date }) verifiedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class AdminMerchantListResponseDto {
  @ApiProperty({ type: [AdminMerchantListItemDto] })
  items!: AdminMerchantListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

/** GET /admin/merchants/:id — MerchantsService.adminGetDetail's
 * AdminMerchantVerificationEvent. See adminGetDetail's own doc comment
 * for the full masking/audit rationale. */
export class AdminMerchantVerificationEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MerchantVerificationStatus })
  fromStatus!: MerchantVerificationStatus;
  @ApiProperty({ enum: MerchantVerificationStatus })
  toStatus!: MerchantVerificationStatus;
  @ApiPropertyOptional({ nullable: true, type: String })
  actorAdminId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) note!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: "object",
    additionalProperties: true,
    description: "This event's own submitted-documents snapshot, if any.",
  })
  docsJson!: unknown;
  @ApiProperty() createdAt!: Date;
}

/** GET /admin/merchants/:id — the admin-only KYC detail read.
 * MerchantsService.adminGetDetail's AdminMerchantDetail. `iban` is the
 * FULL value (not masked) — a deliberate call, justified at length in
 * adminGetDetail's own doc comment: the whole point of this endpoint is
 * letting an approver cross-check the IBAN against the bank document in
 * docsJson, which a masked value can't do. ADMIN-only, and every read of
 * this endpoint writes its own AuditLog row (action
 * "merchant.kyc.viewed") — reading this row is itself a sensitive
 * action. */
export class AdminMerchantDetailResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() legalName!: string;
  @ApiProperty() tradeName!: string;
  @ApiProperty() taxId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) mersisNo!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  kepAddress!: string | null;
  @ApiProperty({
    description:
      "Full IBAN, deliberately not masked to last-4 — see this endpoint's own doc comment for why.",
  })
  iban!: string;
  @ApiProperty({ enum: MerchantVerificationStatus })
  verificationStatus!: MerchantVerificationStatus;
  @ApiPropertyOptional({ nullable: true, type: Date }) verifiedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  nextReverifyAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  sttAttestationAcceptedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  intermediationAcceptedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  intermediationContractVersion!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: "object",
    additionalProperties: true,
    description:
      "The most recent non-null docsJson among verificationEvents below — the documents behind the merchant's current status. Null if never submitted.",
  })
  docsJson!: unknown;
  @ApiProperty({ type: [AdminMerchantVerificationEventDto] })
  verificationEvents!: AdminMerchantVerificationEventDto[];
}
