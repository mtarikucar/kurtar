import { IsOptional, IsString, MaxLength } from "class-validator";

/** Body for both POST .../:id/resolve and .../:id/escalate — an optional
 * free-text admin note, stored on the AuditLog row's diffJson. */
export class AdminComplaintActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
