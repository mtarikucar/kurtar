import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { OfferStatus } from "@prisma/client";

/** [Contract completion] The raw DailyOffer Prisma model — create()
 * returns it unmodified. `publishAt`/`publishedAt` are nullable (only
 * ever set once the offer is scheduled/published). */
export class DailyOfferDto {
  @ApiProperty() id!: string;
  @ApiProperty() bagTemplateId!: string;
  @ApiProperty() storeId!: string;
  @ApiProperty() offerDate!: Date;
  @ApiProperty() qtyTotal!: number;
  @ApiProperty() qtyReserved!: number;
  @ApiProperty() qtyRedeemed!: number;
  @ApiProperty() pickupStartAt!: Date;
  @ApiProperty() pickupEndAt!: Date;
  @ApiProperty({ enum: OfferStatus }) status!: OfferStatus;
  @ApiPropertyOptional({ nullable: true, type: Date }) publishAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  publishedAt!: Date | null;
  @ApiProperty() version!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/** POST /offers/:id/publish */
export class OfferPublishResponseDto {
  @ApiProperty() offerId!: string;
  @ApiProperty({ enum: ["PUBLISHED"] }) status!: "PUBLISHED";
  @ApiProperty() publishedAt!: Date;
}

/** POST /offers/:id/schedule */
export class OfferScheduleResponseDto {
  @ApiProperty() offerId!: string;
  @ApiProperty({ enum: ["SCHEDULED"] }) status!: "SCHEDULED";
  @ApiProperty() publishAt!: Date;
}

/** POST /offers/:id/close */
export class OfferCloseResponseDto {
  @ApiProperty() offerId!: string;
  @ApiProperty({ enum: ["CLOSED"] }) status!: "CLOSED";
}

export class RefundBatchOutcomeDto {
  @ApiProperty() reservationId!: string;
  @ApiProperty() ok!: boolean;
  @ApiPropertyOptional() refundRef?: string;
  @ApiPropertyOptional() error?: string;
}

/** POST /offers/:id/cancel — OfferCancelResult. */
export class OfferCancelResponseDto {
  @ApiProperty() offerId!: string;
  @ApiProperty({ enum: ["CANCELLED"] }) status!: "CANCELLED";
  @ApiProperty() expiredCount!: number;
  @ApiProperty() cancelledCount!: number;
  @ApiProperty({ type: [RefundBatchOutcomeDto] })
  refundResults!: RefundBatchOutcomeDto[];
}

/** GET /offers/mine — OffersService.listMine's bespoke per-item
 * projection (bagTemplate.title/priceCents + store.name folded in, plus
 * a derived qtyLeft) — NOT the raw DailyOffer model. */
export class OfferMineItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() storeId!: string;
  @ApiProperty() storeName!: string;
  @ApiProperty() bagTemplateId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() priceCents!: number;
  @ApiProperty({ description: "YYYY-MM-DD, Istanbul calendar day." })
  offerDate!: string;
  @ApiProperty({ enum: OfferStatus }) status!: OfferStatus;
  @ApiProperty() qtyTotal!: number;
  @ApiProperty() qtyReserved!: number;
  @ApiProperty() qtyRedeemed!: number;
  @ApiProperty() qtyLeft!: number;
  @ApiProperty() pickupStartAt!: Date;
  @ApiProperty() pickupEndAt!: Date;
}
