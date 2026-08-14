import { Body, Controller, Get, Post } from "@nestjs/common";
import { Actors } from "../auth/decorators/actors.decorator";
import { SchedulePricingDto } from "./dto/schedule-pricing.dto";
import { PricingService } from "./pricing.service";

@Controller("admin/pricing")
@Actors("ADMIN")
export class AdminPricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  list() {
    return this.pricing.listPricing();
  }

  /** Always a NEW row with a future effectiveFrom — see
   * PricingService.scheduleFuturePricing's doc comment on why this is
   * never an update of history. */
  @Post()
  schedule(@Body() dto: SchedulePricingDto) {
    return this.pricing.scheduleFuturePricing(dto);
  }
}
