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
import { ReservationsService } from "./reservations.service";
import {
  ReservationCancelResponseDto,
  ReservationCreateResponseDto,
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
