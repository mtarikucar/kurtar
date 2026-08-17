import { IsOptional, IsString, MaxLength } from "class-validator";

/** Body for both POST .../:id/action and .../:id/dismiss — an optional
 * free-text admin note, stored on the AuditLog row's diffJson. */
export class AdminReportActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
