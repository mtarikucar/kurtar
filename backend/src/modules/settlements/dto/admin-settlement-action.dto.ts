import { IsOptional, IsString, MaxLength } from "class-validator";

/** Body for POST .../:id/hold — an optional free-text reason, stored on
 * SettlementBatch.holdReason. approve/retry take no body. */
export class AdminSettlementActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
