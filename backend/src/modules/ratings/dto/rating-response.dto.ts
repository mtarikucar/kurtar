import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ModerationStatus } from "@prisma/client";

/** [Contract completion] The raw Rating Prisma model — POST
 * /reservations/:id/rating and the admin approve/reject actions all
 * return it unmodified. */
export class RatingDto {
  @ApiProperty() id!: string;
  @ApiProperty() reservationId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() storeId!: string;
  @ApiProperty() overallStars!: number;
  @ApiPropertyOptional({ nullable: true, type: Number })
  foodQuality!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) service!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  comment!: string | null;
  @ApiProperty({ enum: ModerationStatus }) moderationStatus!: ModerationStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/** GET /admin/ratings — RatingsService.adminList's `{items,total,page,
 * pageSize}` envelope, items are the raw Rating model. */
export class AdminRatingListResponseDto {
  @ApiProperty({ type: [RatingDto] }) items!: RatingDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

/** GET /ratings/mine (MERCHANT) — RatingsService.listMine's bespoke
 * per-item select (id/overallStars/foodQuality/service/comment/
 * moderationStatus/createdAt only — deliberately NEVER the reviewing
 * consumer's identity, per the service's own doc comment) plus the
 * store-level aggregate/distribution/pendingCount this endpoint folds in
 * alongside the page of items. NOT the generic {items,total,page,
 * pageSize} envelope — a richer, bespoke shape. */
export class RatingsMineItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() overallStars!: number;
  @ApiPropertyOptional({ nullable: true, type: Number })
  foodQuality!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) service!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  comment!: string | null;
  @ApiProperty({ enum: ModerationStatus }) moderationStatus!: ModerationStatus;
  @ApiProperty() createdAt!: Date;
}

export class RatingDistributionDto {
  @ApiProperty() 1!: number;
  @ApiProperty() 2!: number;
  @ApiProperty() 3!: number;
  @ApiProperty() 4!: number;
  @ApiProperty() 5!: number;
}

export class RatingsMineResponseDto {
  @ApiProperty() storeId!: string;
  @ApiProperty() avgStars!: number;
  @ApiProperty() ratingCount!: number;
  @ApiProperty({ type: RatingDistributionDto })
  distribution!: RatingDistributionDto;
  @ApiProperty({
    description:
      "Count of PENDING (commented, unmoderated) ratings for this store.",
  })
  pendingCount!: number;
  @ApiProperty({ type: [RatingsMineItemDto] }) items!: RatingsMineItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
