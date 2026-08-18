import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { SchedulePricingDto } from "./dto/schedule-pricing.dto";
import { PricingService } from "./pricing.service";
import { PlatformPricingDto } from "./dto/settlement-response.dto";

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
  // [Contract completion] Previously had NO explicit response decorator
  // at all — the swagger CLI plugin's return-type inference still
  // produced *a* schema (list()'s return type is an array), but with no
  // real item shape: `{"type":"array","items":{"type":"object"}}`. That
  // passed an earlier, cruder "has some schema" check but is exactly the
  // same "any/unknown, not a real type" gap this whole pass exists to
  // close — a codegen'd client got `unknown[]`, not real fields. Fixed
  // like every other list here, with a genuine item DTO.
  @ApiOkResponse({ type: PlatformPricingDto, isArray: true })
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
  @ApiCreatedResponse({ type: PlatformPricingDto })
  @Post()
  // [Fix round #6, I5] Binds the acting admin — this changes the per-bag
  // fee for every merchant on the platform and used to leave no record of
  // who scheduled it.
  schedule(
    @CurrentUser("id") adminId: string,
    @Body() dto: SchedulePricingDto,
  ) {
    return this.pricing.scheduleFuturePricing(dto, adminId);
  }
}
