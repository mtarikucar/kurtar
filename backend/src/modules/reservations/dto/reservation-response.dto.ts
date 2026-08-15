import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ReservationStatus } from "@prisma/client";

/** [Contract completion] The raw Reservation Prisma model, scalar columns
 * only — listMine's raw `SELECT * FROM reservations` returns exactly
 * these columns, no relations (never `payment`/`rating`/etc — those need
 * an explicit include/join this raw query doesn't do). */
export class ReservationDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() offerId!: string;
  @ApiProperty() storeId!: string;
  @ApiProperty() qty!: number;
  @ApiProperty() unitPriceCents!: number;
  @ApiProperty() totalCents!: number;
  @ApiProperty({ enum: ReservationStatus }) status!: ReservationStatus;
  @ApiProperty() cancelDeadlineAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: Date }) redeemedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  redeemedByMerchantUserId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  pickupReminderSentAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/** GET /reservations/mine — ListReservationsResult. NOTE: this envelope's
 * 4th field is genuinely named `limit`, not `pageSize` — unlike every
 * other paginated list in this API (settlements/complaints/reports/
 * ratings/merchants all use `{items,total,page,pageSize}`). This is a
 * real, pre-existing inconsistency in the API surface (reservations.
 * service.ts's own ListReservationsResult interface), documented as-is
 * per the brief's "derive, never hand-copy" — not silently normalized to
 * `pageSize` here, which would misrepresent the actual field name a
 * client receives. Flagged separately as a contract inconsistency. */
export class ReservationListResponseDto {
  @ApiProperty({ type: [ReservationDto] }) items!: ReservationDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

/** POST /reservations — CreateReservationResult. */
export class ReservationPaymentDto {
  @ApiProperty() merchantOid!: string;
  @ApiPropertyOptional() redirectUrl?: string;
}

export class ReservationCreateResponseDto {
  @ApiProperty() reservationId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() totalCents!: number;
  @ApiProperty({ type: ReservationPaymentDto }) payment!: ReservationPaymentDto;
}

/** POST /reservations/:id/cancel */
export class ReservationCancelResponseDto {
  @ApiProperty() reservationId!: string;
  @ApiProperty({ enum: ReservationStatus }) status!: ReservationStatus;
}

/** POST /reservations/:id/redeem */
export class ReservationRedeemResponseDto {
  @ApiProperty() reservationId!: string;
  @ApiProperty({ enum: ["REDEEMED"] }) status!: "REDEEMED";
  @ApiProperty() redeemedAt!: Date;
}
