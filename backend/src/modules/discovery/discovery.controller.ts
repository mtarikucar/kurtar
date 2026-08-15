import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { DiscoveryService } from "./discovery.service";
import { DiscoveryMapQueryDto } from "./dto/discovery-map-query.dto";
import { DiscoveryOffersQueryDto } from "./dto/discovery-offers-query.dto";

@ApiTags("discovery")
@Controller("discovery")
@Public()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @ApiOperation({ summary: "Nearby live offers, paginated. No auth required." })
  @Get("offers")
  offers(@Query() query: DiscoveryOffersQueryDto) {
    return this.discovery.searchOffers(query);
  }

  @ApiOperation({
    summary: "Store pins within a map bounding box. No auth required.",
  })
  @Get("map")
  map(@Query() query: DiscoveryMapQueryDto) {
    return this.discovery.map(query);
  }

  @ApiOperation({
    summary:
      "A store's public profile — today's offers + rating aggregate. No auth required.",
  })
  @Get("stores/:id")
  store(@Param("id") id: string) {
    return this.discovery.storeProfile(id);
  }
}
