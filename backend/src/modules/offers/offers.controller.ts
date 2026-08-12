import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateOfferDto } from "./dto/create-offer.dto";
import { ListOffersMineQueryDto } from "./dto/list-offers-mine-query.dto";
import { ScheduleOfferDto } from "./dto/schedule-offer.dto";
import { OffersService } from "./offers.service";

@Controller("offers")
@Actors("MERCHANT")
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post()
  create(
    @CurrentUser("merchantId") merchantId: string,
    @Body() dto: CreateOfferDto,
  ) {
    return this.offers.create(merchantId, dto);
  }

  @Get("mine")
  listMine(
    @CurrentUser("merchantId") merchantId: string,
    @Query() query: ListOffersMineQueryDto,
  ) {
    return this.offers.listMine(merchantId, query.date);
  }

  @Post(":id/publish")
  publish(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.offers.publish(merchantId, id);
  }

  @Post(":id/schedule")
  schedule(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
    @Body() dto: ScheduleOfferDto,
  ) {
    return this.offers.schedule(merchantId, id, dto);
  }

  @Post(":id/close")
  close(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.offers.close(merchantId, id);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.offers.cancel(merchantId, id);
  }
}
