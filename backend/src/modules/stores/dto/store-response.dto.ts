import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BagCategory } from "@prisma/client";

/** [Contract completion] The raw Store Prisma model, as returned
 * unmodified by create/list/get/update (no select/omit narrows any of
 * them). `location` (an `Unsupported("geography(Point,4326)")` column) is
 * NOT a documentation gap — Prisma's generated Client type excludes
 * Unsupported columns entirely, so it is never actually present on any
 * value this service returns; latitude/longitude are the real,
 * queryable coordinates. */
export class StoreDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiProperty() district!: string;
  @ApiProperty() city!: string;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiPropertyOptional({ nullable: true, type: String })
  coverImageUrl!: string | null;
  @ApiProperty({ enum: BagCategory, isArray: true })
  categoryTags!: BagCategory[];
  @ApiPropertyOptional({
    nullable: true,
    type: "object",
    additionalProperties: true,
  })
  openingHoursJson!: unknown;
  @ApiProperty() active!: boolean;
  @ApiProperty() avgStars!: number;
  @ApiProperty() ratingCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
