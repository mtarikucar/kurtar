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
 * Unlike the /auth/* login endpoints, this handler returns the service
 * result directly (no AuthController.respond() cookie-stripping) — the
 * refresh token is ALWAYS present in the body here, never conditionally
 * omitted, and no httpOnly cookie is set by this endpoint either. */
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
