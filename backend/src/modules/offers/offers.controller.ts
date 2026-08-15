import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { CreateOfferDto } from "./dto/create-offer.dto";
import { ListOffersMineQueryDto } from "./dto/list-offers-mine-query.dto";
import { ScheduleOfferDto } from "./dto/schedule-offer.dto";
import { OffersService } from "./offers.service";

@ApiTags("offers")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("offers")
@Actors("MERCHANT")
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  // create/publish/schedule/close/cancel all require APPROVED by default —
  // MerchantApprovalGuard.
  @ApiOperation({
    summary: "Create a DailyOffer from one of the merchant's bag templates.",
  })
  @Post()
  create(
    @CurrentUser("merchantId") merchantId: string,
    @Body() dto: CreateOfferDto,
  ) {
    return this.offers.create(merchantId, dto);
  }

  // Read stays available regardless of status.
  @ApiOperation({
    summary: "List the calling merchant's own offers for a given date.",
  })
  @Get("mine")
  @AllowUnapprovedMerchant()
  listMine(
    @CurrentUser("merchantId") merchantId: string,
    @Query() query: ListOffersMineQueryDto,
  ) {
    return this.offers.listMine(merchantId, query.date);
  }

  @ApiOperation({
    summary: "Publish an offer, making it visible on discovery.",
  })
  @Post(":id/publish")
  publish(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.offers.publish(merchantId, id);
  }

  @ApiOperation({
    summary: "Schedule an offer to auto-publish at a future instant.",
  })
  @Post(":id/schedule")
  schedule(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
    @Body() dto: ScheduleOfferDto,
  ) {
    return this.offers.schedule(merchantId, id, dto);
  }

  @ApiOperation({
    summary: "Close an offer (no more reservations, existing ones unaffected).",
  })
  @Post(":id/close")
  close(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.offers.close(merchantId, id);
  }

  @ApiOperation({
    summary:
      "Cancel an offer — cancels its live reservations and refunds them.",
  })
  @Post(":id/cancel")
  cancel(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.offers.cancel(merchantId, id);
  }
}
