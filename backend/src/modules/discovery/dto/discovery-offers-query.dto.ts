import { Type } from "class-transformer";
import {
  IsDateString,
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

  // @IsDateString (not @IsString) — discovery.service.ts feeds this
  // straight into `new Date(query.pickupAfter)`. A plain @IsString let
  // any one-character garbage value ("x") reach that constructor and
  // produce an Invalid Date, which then threw a RangeError trying to bind
  // it as a $queryRaw parameter — an unauthenticated 500 from a one-char
  // query param, since this endpoint is @Public.
  @IsOptional()
  @IsDateString()
  pickupAfter?: string;

  @IsOptional()
  @IsDateString()
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
