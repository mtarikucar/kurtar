import { Controller, Get } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import {
  ImpactTotalsDto,
  PublicImpactTotalsDto,
} from "./dto/impact-response.dto";
import { ImpactService } from "./impact.service";

@ApiTags("impact")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("me/impact")
@Actors("CONSUMER")
export class MeImpactController {
  constructor(private readonly impact: ImpactService) {}

  @ApiOperation({
    summary:
      "The caller's own lifetime impact totals (meals saved, CO2e, money saved).",
  })
  @ApiOkResponse({ type: ImpactTotalsDto })
  @Get()
  getMine(@CurrentUser("id") userId: string) {
    return this.impact.getMine(userId);
  }
}

@ApiTags("impact")
@Controller("impact")
@Public()
export class PublicImpactController {
  constructor(private readonly impact: ImpactService) {}

  @ApiOperation({
    summary:
      "Platform-wide impact totals for the landing page. No auth required; served from a 5-minute Redis cache.",
  })
  @ApiOkResponse({ type: PublicImpactTotalsDto })
  @Get("public")
  getPublic() {
    return this.impact.getPublic();
  }
}
