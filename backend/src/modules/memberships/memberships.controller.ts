import { Controller, Get } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { MembershipsService } from "./memberships.service";
import { MembershipMineResponseDto } from "./dto/membership-response.dto";

@ApiTags("memberships")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("merchants/me/membership")
@Actors("MERCHANT")
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @ApiOperation({
    summary:
      "The calling merchant's own membership subscription and outstanding balance.",
  })
  @ApiOkResponse({ type: MembershipMineResponseDto })
  @Get()
  getMine(@CurrentUser("merchantId") merchantId: string) {
    return this.memberships.getMine(merchantId);
  }
}
