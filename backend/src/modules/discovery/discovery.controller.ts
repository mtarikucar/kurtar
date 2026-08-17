import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { DiscoveryService } from "./discovery.service";
import { DiscoveryMapQueryDto } from "./dto/discovery-map-query.dto";
import { DiscoveryOffersQueryDto } from "./dto/discovery-offers-query.dto";
import {
  DiscoveryMapPinDto,
  DiscoveryOfferDetailResponseDto,
  DiscoveryOffersResponseDto,
  DiscoveryStoreProfileResponseDto,
} from "./dto/discovery-offers-response.dto";

@ApiTags("discovery")
@Controller("discovery")
@Public()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @ApiOperation({ summary: "Nearby live offers, paginated. No auth required." })
  @ApiOkResponse({ type: DiscoveryOffersResponseDto })
  @Get("offers")
  offers(@Query() query: DiscoveryOffersQueryDto) {
    return this.discovery.searchOffers(query);
  }

  // [Universal-link bridge page] A different segment count than
  // GET "offers" above (/discovery/offers/:id vs /discovery/offers), so
  // there is no route-shadowing risk between the two regardless of
  // declaration order — Express only ever considers this a candidate
  // match for a request path with exactly one MORE segment. Registered
  // here anyway, directly under "offers", for readability.
  @ApiOperation({
    summary:
      "A single offer's public share preview (the universal-link bridge page /o/[id]). Same visibility rules as the list — a non-visible or nonexistent offer 404s identically. No auth required.",
  })
  @ApiOkResponse({ type: DiscoveryOfferDetailResponseDto })
  @Get("offers/:id")
  offer(@Param("id") id: string) {
    return this.discovery.getOfferById(id);
  }

  @ApiOperation({
    summary: "Store pins within a map bounding box. No auth required.",
  })
  @ApiOkResponse({ type: DiscoveryMapPinDto, isArray: true })
  @Get("map")
  map(@Query() query: DiscoveryMapQueryDto) {
    return this.discovery.map(query);
  }

  @ApiOperation({
    summary:
      "A store's public profile — today's offers + rating aggregate. No auth required.",
  })
  @ApiOkResponse({ type: DiscoveryStoreProfileResponseDto })
  @Get("stores/:id")
  store(@Param("id") id: string) {
    return this.discovery.storeProfile(id);
  }
}
