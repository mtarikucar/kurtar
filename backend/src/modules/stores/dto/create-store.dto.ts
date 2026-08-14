import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { BagCategory } from "@prisma/client";

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsNotEmpty()
  district!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  // Physical validity + the Turkey bounding box are checked in
  // store-geo.rules.ts, not here — @IsNumber only guards the shape.
  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(BagCategory, { each: true })
  categoryTags?: BagCategory[];

  @IsOptional()
  @IsObject()
  openingHoursJson?: Record<string, unknown>;
}
