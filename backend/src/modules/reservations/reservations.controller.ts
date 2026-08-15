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

  // Judgment call (Task 5 review): redeem is exempted from
  // MerchantApprovalGuard's default-deny. It never creates a new sale —
  // it fulfills one already paid for — and blocking it would strand a
  // customer who paid before the merchant was suspended. The suspend
  // kill-switch already force-cancels+refunds every PENDING_PAYMENT/
  // CONFIRMED reservation on an ACTIVE offer (reservations/reservations.service.ts's
  // cancelAllForOffer); the only reservations that can still be CONFIRMED
  // for a SUSPENDED merchant are ones tied to an already-CLOSED offer,
  // which stores.service.ts/offers.service.ts deliberately leave
  // untouched ("existing reservations unaffected") — those customers are
  // still entitled to their food.
  @ApiOperation({
    summary:
      "Redeem a reservation's pickup code (MERCHANT, staff scan at the counter).",
  })
  @ApiCreatedResponse({ type: ReservationRedeemResponseDto })
  @Actors("MERCHANT")
  @AllowUnapprovedMerchant()
  @Post(":id/redeem")
  redeem(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string) {
    return this.reservations.redeem(user.id, user.merchantId!, id);
  }
}
