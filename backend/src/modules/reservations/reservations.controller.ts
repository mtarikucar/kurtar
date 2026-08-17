import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedPrincipal } from "../auth/strategies/jwt.strategy";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { ListReservationsQueryDto } from "./dto/list-reservations-query.dto";
import { ListReservationsForMerchantQueryDto } from "./dto/list-reservations-for-merchant-query.dto";
import { ReservationsService } from "./reservations.service";
import {
  ReservationCancelResponseDto,
  ReservationCreateResponseDto,
  ReservationForMerchantListResponseDto,
  ReservationListResponseDto,
  ReservationRedeemResponseDto,
} from "./dto/reservation-response.dto";

@ApiTags("reservations")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("reservations")
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @ApiOperation({ summary: "Reserve a bag from a live offer (CONSUMER)." })
  @ApiCreatedResponse({ type: ReservationCreateResponseDto })
  @Actors("CONSUMER")
  @Post()
  create(@CurrentUser("id") userId: string, @Body() dto: CreateReservationDto) {
    return this.reservations.create(userId, dto.offerId, dto.qty);
  }

  @ApiOperation({
    summary: "Cancel the caller's own reservation and refund it (CONSUMER).",
  })
  @ApiCreatedResponse({ type: ReservationCancelResponseDto })
  @Actors("CONSUMER")
  @Post(":id/cancel")
  cancel(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.reservations.cancel(userId, id);
  }

  @ApiOperation({
    summary: "List the caller's own reservations, paginated (CONSUMER).",
  })
  @ApiOkResponse({ type: ReservationListResponseDto })
  @Actors("CONSUMER")
  @Get("mine")
  listMine(
    @CurrentUser("id") userId: string,
    @Query() query: ListReservationsQueryDto,
  ) {
    return this.reservations.listMine(userId, query.page, query.pageSize);
  }

  // [Merchant pickup list] A static segment ("for-merchant"), same as
  // "mine" above — both registered here, before any `:id`-taking GET
  // route could ever exist in this controller, so neither is at risk of
  // the exact route-shadowing trap that bit GET /complaints/assigned
  // (a static path silently swallowed as a `:id` param because the more
  // specific controller registered second). No `:id`-taking GET exists
  // in this controller today (only POST :id/cancel and POST :id/redeem),
  // but the ordering discipline is cheap insurance against ever adding
  // one carelessly later. No @AllowUnapprovedMerchant() — unlike
  // redeem() below, this is a plain read with no "must still work for a
  // customer who already paid" pressure, so it stays behind
  // MerchantApprovalGuard's normal APPROVED-only default.
  @ApiOperation({
    summary:
      "List reservations for the caller's own offers — the merchant's pickup list, paginated.",
  })
  @ApiOkResponse({ type: ReservationForMerchantListResponseDto })
  @Actors("MERCHANT")
  @Get("for-merchant")
  listForMerchant(
    @CurrentUser("merchantId") merchantId: string,
    @Query() query: ListReservationsForMerchantQueryDto,
  ) {
    return this.reservations.listForMerchant(merchantId, {
      storeId: query.storeId,
      offerId: query.offerId,
      date: query.date,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  // [Consumer redeem] CONSUMER (owner, live-clock phone swipe — the
  // product's defining interaction, plan §4.6) or MERCHANT (staff panel,
  // the documented fallback for a dead customer phone). Judgment call
  // preserved from the original Task 5 review for the MERCHANT path:
  // redeem is exempted from MerchantApprovalGuard's default-deny — it
  // never creates a new sale, it fulfills one already paid for, and
  // blocking it would strand a customer who paid before the merchant was
  // suspended (MerchantApprovalGuard is a no-op for CONSUMER callers
  // regardless, so this exemption only ever affects the MERCHANT path).
  @ApiOperation({
    summary:
      "Redeem a reservation's pickup code — CONSUMER (the phone-swipe, owner-only) or MERCHANT (staff panel, fallback for a dead customer phone).",
  })
  @ApiCreatedResponse({ type: ReservationRedeemResponseDto })
  @Actors("CONSUMER", "MERCHANT")
  @AllowUnapprovedMerchant()
  @Post(":id/redeem")
  redeem(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string) {
    const redeemedBy =
      user.actor === "CONSUMER"
        ? ({ actorType: "CONSUMER", userId: user.id } as const)
        : ({
            actorType: "MERCHANT",
            merchantUserId: user.id,
            merchantId: user.merchantId!,
          } as const);
    return this.reservations.redeem(redeemedBy, id);
  }
}
