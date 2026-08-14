import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { DiscoveryService } from "./discovery.service";
import { DiscoveryMapQueryDto } from "./dto/discovery-map-query.dto";
import { DiscoveryOffersQueryDto } from "./dto/discovery-offers-query.dto";

@Controller("discovery")
@Public()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get("offers")
  offers(@Query() query: DiscoveryOffersQueryDto) {
    return this.discovery.searchOffers(query);
  }

  @Get("map")
  map(@Query() query: DiscoveryMapQueryDto) {
    return this.discovery.map(query);
  }

  @Get("stores/:id")
  store(@Param("id") id: string) {
    return this.discovery.storeProfile(id);
  }
}
