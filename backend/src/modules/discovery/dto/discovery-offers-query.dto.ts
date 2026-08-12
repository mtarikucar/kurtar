import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { BagCategory } from "@prisma/client";

export class DiscoveryOffersQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  radiusM: number = 3000;

  @IsOptional()
  @IsEnum(BagCategory)
  category?: BagCategory;

  // Comma-separated DietFlag values (e.g. "VEGAN,GLUTEN_FREE") — split and
  // validated in discovery.service.ts; class-validator has no clean
  // decorator for "comma-separated enum list in one query param".
  @IsOptional()
  @IsString()
  @MaxLength(200)
  diet?: string;

  @IsOptional()
  @IsString()
  pickupAfter?: string;

  @IsOptional()
  @IsString()
  pickupBefore?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  pageSize: number = 20;
}
