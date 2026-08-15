import { ApiProperty } from "@nestjs/swagger";

/** [Fix round, Important 5] Documentation-only response shapes for
 * GET /discovery/offers — mirror DiscoveryOfferItem/DiscoveryOffersResult
 * (discovery.service.ts) field-for-field. Never imported by the service;
 * referenced only via @ApiOkResponse on the controller, so a drift
 * between this and the real return shape is a documentation bug, not a
 * runtime one — same "response DTOs are additive, not authoritative"
 * approach used for every other read documented this round. */
export class DiscoveryOfferStoreDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() district!: string;
  @ApiProperty({ description: "Meters from the query's lat/lng." })
  distanceM!: number;
}

export class DiscoveryOfferTemplateDto {
  @ApiProperty() title!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ type: [String] }) dietFlags!: string[];
  @ApiProperty() priceCents!: number;
  @ApiProperty() originalValueCentsMin!: number;
  @ApiProperty() originalValueCentsMax!: number;
}

export class DiscoveryOfferItemDto {
  @ApiProperty() offerId!: string;
  @ApiProperty({ type: DiscoveryOfferStoreDto }) store!: DiscoveryOfferStoreDto;
  @ApiProperty({ type: DiscoveryOfferTemplateDto })
  template!: DiscoveryOfferTemplateDto;
  @ApiProperty() pickupStartAt!: string;
  @ApiProperty() pickupEndAt!: string;
  @ApiProperty() qtyLeft!: number;
  @ApiProperty({ nullable: true, type: String }) coverImageUrl!: string | null;
}

export class DiscoveryOffersResponseDto {
  @ApiProperty({ type: [DiscoveryOfferItemDto] })
  items!: DiscoveryOfferItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class DiscoveryMapPinDto {
  @ApiProperty() storeId!: string;
  @ApiProperty() lat!: number;
  @ApiProperty() lng!: number;
  @ApiProperty() minPriceCents!: number;
  @ApiProperty() offersCount!: number;
}

export class DiscoveryTodaysOfferDto {
  @ApiProperty() offerId!: string;
  @ApiProperty({ type: DiscoveryOfferTemplateDto })
  template!: DiscoveryOfferTemplateDto;
  @ApiProperty() pickupStartAt!: Date;
  @ApiProperty() pickupEndAt!: Date;
  @ApiProperty() qtyLeft!: number;
}

export class DiscoveryStorePublicDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiProperty() district!: string;
  @ApiProperty() city!: string;
  @ApiProperty({ nullable: true, type: String }) coverImageUrl!: string | null;
  @ApiProperty({ type: [String] }) categoryTags!: string[];
  @ApiProperty({ nullable: true, type: Object }) openingHoursJson!: unknown;
}

export class DiscoveryStoreRatingDto {
  @ApiProperty() average!: number;
  @ApiProperty() count!: number;
}

export class DiscoveryStoreProfileResponseDto {
  @ApiProperty({ type: DiscoveryStorePublicDto })
  store!: DiscoveryStorePublicDto;
  @ApiProperty({ type: [DiscoveryTodaysOfferDto] })
  todaysOffers!: DiscoveryTodaysOfferDto[];
  @ApiProperty({ type: DiscoveryStoreRatingDto })
  rating!: DiscoveryStoreRatingDto;
}
