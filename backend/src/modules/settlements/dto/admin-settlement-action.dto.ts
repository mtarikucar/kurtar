import { IsOptional, IsString, MaxLength } from "class-validator";

/** Body for POST .../:id/hold — an optional free-text reason, stored on
 * SettlementBatch.holdReason. approve/retry take no body. */
export class AdminSettlementActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** [Cross-lane fix, M3] Body for POST .../:id/settle — the bank/PSP
 * statement reference the admin reconciled the transfer against (a dekont
 * number, an EFT reference, a statement line). Optional: an admin who has
 * confirmed arrival without a reference to hand still gets to record the
 * confirmation, which is the point of the action. Stored verbatim on
 * SettlementBatch.settlementReference. */
export class AdminSettlementSettleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}
