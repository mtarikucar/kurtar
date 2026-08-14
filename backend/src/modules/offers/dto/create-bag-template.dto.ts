import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { BagCategory, DietFlag } from "@prisma/client";

export class CreateBagTemplateDto {
  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsEnum(BagCategory)
  category!: BagCategory;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(DietFlag, { each: true })
  dietFlags?: DietFlag[];

  @IsString()
  @IsNotEmpty()
  allergenDisclaimer!: string;

  @IsInt()
  @Min(0)
  originalValueCentsMin!: number;

  @IsInt()
  @Min(0)
  originalValueCentsMax!: number;

  // The real, authoritative floor check (BAG_PRICE_FLOOR_CENTS, and the
  // price-below-value cross-field check) runs in
  // bag-template.rules.ts::validateBagTemplateEconomics — this @Min is a
  // cheap first-pass reject for an obviously-wrong value (e.g. negative),
  // duplicated here only because class-validator decorators can't
  // reference the same runtime constant used elsewhere; keep both in sync
  // if the floor ever changes.
  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsString()
  description?: string;
}
