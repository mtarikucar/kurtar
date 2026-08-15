import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { ReservationStatus } from "@prisma/client";

/**
 * GET /reservations/for-merchant's query — the merchant's own pickup
 * list. `status` is the one filter in this API that's genuinely
 * multi-valued (every other list endpoint's `status` filter is a single
 * optional value — an admin moderation queue views one status at a
 * time): a shop owner watching the pickup window wants "everything still
 * relevant" (e.g. CONFIRMED + REDEEMED together), not one status in
 * isolation. Encoded as CSV in one query param (`?status=CONFIRMED,
 * REDEEMED`) rather than a repeated key (`?status=A&status=B`) — CSV
 * parses to the same shape (a string) whether the caller sends one value
 * or several, avoiding the well-known Express/qs quirk where a repeated
 * key becomes an array but a single occurrence becomes a bare string.
 * No other endpoint in this API has a multi-value filter yet; if one is
 * ever added, match this same CSV encoding for consistency.
 */
export class ListReservationsForMerchantQueryDto {
  @ApiPropertyOptional({
    description: "Restrict to one of the caller's own stores.",
  })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({
    description: "Restrict to one specific offer.",
  })
  @IsOptional()
  @IsString()
  offerId?: string;

  @ApiPropertyOptional({
    description:
      "YYYY-MM-DD, Europe/Istanbul calendar day — which offer.offerDate to show. Defaults to today.",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date must be a YYYY-MM-DD string",
  })
  date?: string;

  @ApiPropertyOptional({
    enum: ReservationStatus,
    isArray: true,
    description:
      "Comma-separated ReservationStatus values (e.g. CONFIRMED,REDEEMED). Defaults to every status.",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsEnum(ReservationStatus, { each: true })
  status?: ReservationStatus[];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
