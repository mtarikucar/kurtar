import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SettlementStatus } from "@prisma/client";

/** [Contract completion] The raw SettlementBatch Prisma model's SCALAR
 * columns (id through updatedAt) — every list/detail endpoint returns
 * these unconditionally; relation fields (merchant/settlementLines/
 * commissionInvoices) are separate, endpoint-specific additions below,
 * added only where the service's own `include` actually loads them. The
 * self-relation object fields (carriedDemandSource/carriedDemandSuccessors/
 * carriedDemandClaim/carriedDemandClaimsAgainst) and clawedBackLines/
 * clawbackAllocations are NEVER included by any of these endpoints — only
 * the plain carriedDemandSourceBatchId scalar FK is ever present. */
export class SettlementBatchDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiProperty() periodStart!: Date;
  @ApiProperty() periodEnd!: Date;
  @ApiProperty({ enum: SettlementStatus }) status!: SettlementStatus;
  @ApiProperty() grossCents!: number;
  @ApiProperty() bagFeeCents!: number;
  @ApiProperty() bagFeeVatCents!: number;
  @ApiProperty() withholdingCents!: number;
  @ApiProperty() membershipOffsetCents!: number;
  @ApiProperty() membershipOffsetVatCents!: number;
  @ApiProperty() refundClawbackCents!: number;
  @ApiProperty() netPayoutCents!: number;
  @ApiProperty() carriedShortfallCents!: number;
  @ApiProperty() carriedExternalDemandCents!: number;
  @ApiProperty() inheritedExternalDemandCents!: number;
  @ApiPropertyOptional({ nullable: true, type: Date })
  shortfallResolvedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  payoutAttemptedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String }) holdReason!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: Date }) dueAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  pspTransferRef!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Date }) sentAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: String })
  carriedDemandSourceBatchId!: string | null;
}

/** GET /settlements/mine — SettlementsService.listMine's item shape (the
 * raw SettlementBatch scalars, no relations included at all). */
export class SettlementListResponseDto {
  @ApiProperty({ type: [SettlementBatchDto] }) items!: SettlementBatchDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class SettlementLineDto {
  @ApiProperty() id!: string;
  @ApiProperty() batchId!: string;
  @ApiProperty() reservationId!: string;
  @ApiProperty() redeemedAt!: Date;
  @ApiProperty() grossCents!: number;
  @ApiProperty() bagFeeCents!: number;
  @ApiProperty() bagFeeVatCents!: number;
  @ApiProperty() withholdingCents!: number;
  @ApiProperty() clawbackCents!: number;
  @ApiPropertyOptional({ nullable: true, type: Date })
  clawbackAppliedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  clawbackBatchId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CommissionInvoiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) batchId!:
    string | null;
  @ApiProperty({ enum: ["BAG_FEE", "MEMBERSHIP"] }) type!:
    "BAG_FEE" | "MEMBERSHIP";
  @ApiProperty({ enum: ["EFATURA", "EARSIVFATURA"] })
  docType!: "EFATURA" | "EARSIVFATURA";
  @ApiPropertyOptional({ nullable: true, type: String })
  nilveraDocId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) ublXmlRef!:
    string | null;
  @ApiProperty({ enum: ["DRAFT", "SENT", "ACCEPTED", "REJECTED"] })
  status!: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
  @ApiPropertyOptional({ nullable: true, type: Date }) issuedAt!: Date | null;
  @ApiProperty() netAmountCents!: number;
  @ApiProperty() vatCents!: number;
  @ApiProperty() totalAmountCents!: number;
  @ApiPropertyOptional({
    nullable: true,
    type: "object",
    additionalProperties: true,
  })
  linesJson!: unknown;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/** GET /settlements/mine/:id and every admin detail-returning endpoint
 * (get/approve/hold/retry) — all funnel through SettlementsService.
 * adminGet or getMineDetail, both of which `include` the SAME three
 * things: merchant (tradeName only for getMineDetail's caller... no,
 * actually getMineDetail includes settlementLines+commissionInvoices but
 * NOT merchant — see the two subtypes below). */
export class SettlementDetailResponseDto extends SettlementBatchDto {
  @ApiProperty({ type: [SettlementLineDto] })
  settlementLines!: SettlementLineDto[];
  @ApiProperty({ type: [CommissionInvoiceDto] })
  commissionInvoices!: CommissionInvoiceDto[];
}

export class SettlementMerchantSummaryDto {
  @ApiProperty() tradeName!: string;
  @ApiProperty() legalName!: string;
  @ApiProperty() iban!: string;
}

/** GET /admin/settlements/:id, and POST approve|hold|retry (all three
 * return this.adminGet(id) — the SAME shape). adminGet's `include` adds
 * `merchant: {tradeName, legalName, iban}` on top of
 * SettlementDetailResponseDto's lines+invoices. */
export class AdminSettlementDetailResponseDto extends SettlementDetailResponseDto {
  @ApiProperty({ type: SettlementMerchantSummaryDto })
  merchant!: SettlementMerchantSummaryDto;
}

/** GET /admin/settlements — SettlementsService.adminList's item shape:
 * the raw SettlementBatch (no lines/invoices) + `merchant: {tradeName}`
 * only (NOT legalName/iban — a narrower include than adminGet's). */
export class AdminSettlementListMerchantDto {
  @ApiProperty() tradeName!: string;
}

export class AdminSettlementListItemDto extends SettlementBatchDto {
  @ApiProperty({ type: AdminSettlementListMerchantDto })
  merchant!: AdminSettlementListMerchantDto;
}

export class AdminSettlementListResponseDto {
  @ApiProperty({ type: [AdminSettlementListItemDto] })
  items!: AdminSettlementListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

/** POST /admin/settlements/run-nightly — SettlementBatchBuilderService.
 * runNightlyCycle's return shape. */
export class NightlyCycleFailureDto {
  @ApiPropertyOptional({ nullable: true, type: String }) merchantId!:
    string | null;
  @ApiProperty({ enum: ["batch", "clawback-sweep", "clawback-sweep-scan"] })
  stage!: "batch" | "clawback-sweep" | "clawback-sweep-scan";
  @ApiProperty() message!: string;
}

export class RunNightlyCycleResponseDto {
  @ApiProperty({ type: [String] }) batchIds!: string[];
  @ApiProperty({ type: [NightlyCycleFailureDto] })
  failures!: NightlyCycleFailureDto[];
}

/** GET /admin/pricing, POST /admin/pricing — PricingService's
 * ResolvedPlatformPricing & {id}. */
export class PlatformPricingDto {
  @ApiProperty() id!: string;
  @ApiProperty() bagFeeCents!: number;
  @ApiProperty() membershipAnnualCents!: number;
  @ApiProperty() effectiveFrom!: Date;
}
