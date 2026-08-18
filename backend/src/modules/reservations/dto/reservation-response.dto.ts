import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PrincipalType, ReservationStatus } from "@prisma/client";

/** [Contract completion] The raw Reservation Prisma model, scalar columns
 * only — listMine's raw `SELECT r.* ... FROM reservations r` returns
 * exactly these columns, no relations (never `payment`/`rating`/etc —
 * those need an explicit include/join this raw query doesn't do), PLUS
 * the two pickup-window columns below.
 * [Consumer redeem] redeemedByActorType/redeemedByUserId are the new
 * "which actor redeemed this" columns — see reservations.service.ts's
 * redeem() doc comment. Exactly one of redeemedByUserId/
 * redeemedByMerchantUserId is ever set, matching redeemedByActorType;
 * all three are null until the reservation is actually redeemed. */
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
  /** [Cross-lane fix, I9] The pickup window this reservation's redeem is
   * judged against — joined from the reservation's own DailyOffer, which
   * is where the window actually lives. Not derivable client-side: the
   * consumer app used to reconstruct pickupStartAt from cancelDeadlineAt
   * and had NO end time at all whenever it had neither a local
   * purchase-time snapshot nor a live same-day offer (a reinstalled
   * device, or any order from a previous day), which is exactly when the
   * redeem screen most needed to explain itself. */
  @ApiProperty() pickupStartAt!: Date;
  @ApiProperty() pickupEndAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: Date }) redeemedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, enum: PrincipalType })
  redeemedByActorType!: PrincipalType | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  redeemedByUserId!: string | null;
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

/** GET /reservations/for-merchant — ReservationsService.
 * listForMerchant's ReservationForMerchantItem. Deliberately NOT
 * ReservationDto: no userId, no unitPriceCents/totalCents/
 * cancelDeadlineAt/redeemedByMerchantUserId — this is the merchant's
 * pickup-window view (match a customer to a bag), not the full
 * reservation record. `customerFirstName` is the one customer-identity
 * field included, and it is deliberately narrowed to a first name only
 * (see ReservationsService's firstNameOnly() doc comment) — no phone, no
 * email, no surname. */
export class ReservationForMerchantItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() storeId!: string;
  @ApiProperty() offerId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() qty!: number;
  @ApiProperty({ enum: ReservationStatus }) status!: ReservationStatus;
  @ApiProperty() pickupStartAt!: Date;
  @ApiProperty() pickupEndAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: Date }) redeemedAt!: Date | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      "First whitespace-separated token of the customer's name — null if they never set one. No phone/email/surname/userId.",
  })
  customerFirstName!: string | null;
}

export class ReservationForMerchantListResponseDto {
  @ApiProperty({ type: [ReservationForMerchantItemDto] })
  items!: ReservationForMerchantItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
