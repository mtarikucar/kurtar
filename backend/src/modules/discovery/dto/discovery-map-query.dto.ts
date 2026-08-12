import { Type } from "class-transformer";
import { IsEnum, IsLatitude, IsLongitude, IsOptional } from "class-validator";
import { BagCategory } from "@prisma/client";

export class DiscoveryMapQueryDto {
  @Type(() => Number)
  @IsLongitude()
  west!: number;

  @Type(() => Number)
  @IsLatitude()
  south!: number;

  @Type(() => Number)
  @IsLongitude()
  east!: number;

  @Type(() => Number)
  @IsLatitude()
  north!: number;

  @IsOptional()
  @IsEnum(BagCategory)
  category?: BagCategory;
}
