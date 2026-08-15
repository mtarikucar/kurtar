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

/** GET /reservations/mine — ListReservationsResult.
 * [Consistency fix] This envelope's 4th field used to be named `limit`,
 * the one paginated list in this API that didn't agree with everyone
 * else's `{items,total,page,pageSize}` (settlements/complaints/reports/
 * ratings/merchants). Renamed to `pageSize` — both the DTO here and
 * ReservationsService's own ListReservationsResult interface — while the
 * contract was still pre-launch and had zero real consumers (the four
 * app tasks start after this). */
export class ReservationListResponseDto {
  @ApiProperty({ type: [ReservationDto] }) items!: ReservationDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
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
