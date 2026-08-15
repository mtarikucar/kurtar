import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { SchedulePricingDto } from "./dto/schedule-pricing.dto";
import { PricingService } from "./pricing.service";

@ApiTags("admin")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("admin/pricing")
@Actors("ADMIN")
export class AdminPricingController {
  constructor(private readonly pricing: PricingService) {}

  @ApiOperation({
    summary: "List platform pricing history (bag fee, membership annual fee).",
  })
  @Get()
  list() {
    return this.pricing.listPricing();
  }

  /** Always a NEW row with a future effectiveFrom — see
   * PricingService.scheduleFuturePricing's doc comment on why this is
   * never an update of history. */
  @ApiOperation({
    summary:
      "Schedule a future platform pricing change (always a new row, never edits history).",
  })
  @Post()
  schedule(@Body() dto: SchedulePricingDto) {
    return this.pricing.scheduleFuturePricing(dto);
  }
}
