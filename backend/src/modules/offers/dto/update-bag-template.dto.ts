import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { BagCategory, DietFlag } from "@prisma/client";

/**
 * Every field optional (a genuine partial update) — but whichever of
 * priceCents/originalValueCentsMin/originalValueCentsMax ARE present,
 * bag-templates.service.ts re-validates the FULL economics (merged with
 * the existing row's untouched fields) via
 * validateBagTemplateEconomics — never just the changed field in
 * isolation, since "price < value min" is a relationship between fields
 * that could individually look fine.
 */
export class UpdateBagTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsEnum(BagCategory)
  category?: BagCategory;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(DietFlag, { each: true })
  dietFlags?: DietFlag[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  allergenDisclaimer?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  originalValueCentsMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  originalValueCentsMax?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
