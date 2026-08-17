import { IsISO8601, IsOptional } from "class-validator";

/** Shared query shape for every CSV export (complaints/settlements/
 * merchants) — both bounds optional, both applied against the row's
 * `createdAt` for a single, predictable filtering rule across all three
 * exports rather than a different "natural" date column per report. */
export class AdminExportRangeQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
