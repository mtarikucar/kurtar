import { IsOptional, IsString, MaxLength } from "class-validator";

/** Body for approve/reject/suspend — an optional free-text note, recorded
 * on the MerchantVerificationEvent row for the transition. */
export class AdminMerchantActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
