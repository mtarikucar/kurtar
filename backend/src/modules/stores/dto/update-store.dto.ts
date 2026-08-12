import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { BagCategory } from "@prisma/client";

/**
 * Every field optional (partial update). `active` is the toggle mentioned
 * in the brief — folded into this general PATCH rather than a separate
 * endpoint. latitude/longitude must be supplied TOGETHER or not at all —
 * enforced in stores.service.ts (a single coordinate alone is ambiguous:
 * is the other one unchanged, or was the caller trying and failing to
 * move the pin?), not expressible as a plain per-field decorator here.
 */
export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  address?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  district?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

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

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
