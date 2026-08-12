import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  bagTemplateId!: string;

  // Europe/Istanbul calendar date — see offer-window.rules.ts. Kept as a
  // plain string (not @IsDateString, which accepts full ISO datetimes) so
  // there is no timezone ambiguity to resolve before the window checks
  // run.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "offerDate must be a YYYY-MM-DD string",
  })
  offerDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  qtyTotal!: number;

  @IsDateString()
  pickupStartAt!: string;

  @IsDateString()
  pickupEndAt!: string;
}
