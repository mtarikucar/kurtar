import { ApiProperty } from "@nestjs/swagger";

/** [Fix round, Important 5] Documentation-only response shapes mirroring
 * FavoriteListItem/FavoriteListResult (favorites.service.ts). */
export class FavoriteStoreSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() district!: string;
  @ApiProperty() city!: string;
  @ApiProperty({ nullable: true, type: String }) coverImageUrl!: string | null;
  @ApiProperty() avgStars!: number;
  @ApiProperty() ratingCount!: number;
  @ApiProperty() active!: boolean;
}

export class FavoriteListItemDto {
  @ApiProperty() storeId!: string;
  @ApiProperty() favoritedAt!: Date;
  @ApiProperty({ type: FavoriteStoreSummaryDto })
  store!: FavoriteStoreSummaryDto;
  @ApiProperty() hasLiveOfferToday!: boolean;
}

export class FavoriteListResponseDto {
  @ApiProperty({ type: [FavoriteListItemDto] }) items!: FavoriteListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
