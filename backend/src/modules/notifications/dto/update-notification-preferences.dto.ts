import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

/** Partial update — every field optional (PATCH semantics: an omitted
 * field is left unchanged). quietHoursStart/End cannot currently be
 * explicitly cleared back to null via this endpoint once set (only
 * reassigned to a new hour) — a known, deliberately deferred gap; see the
 * task report. */
export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  favoritesEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  nearbyEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(50_000)
  nearbyRadiusM?: number;

  @IsOptional()
  @IsBoolean()
  marketingEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStart?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEnd?: number;
}
