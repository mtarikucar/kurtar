import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { ListComplaintsQueryDto } from "./dto/list-complaints-query.dto";
import { ComplaintsService } from "./complaints.service";
import {
  ComplaintDetailResponseDto,
  ComplaintListResponseDto,
} from "./dto/complaint-response.dto";

@ApiTags("complaints")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("complaints/assigned")
@Actors("MERCHANT")
@AllowUnapprovedMerchant()
export class MerchantComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @ApiOperation({
    summary: "List complaints assigned to the caller's own merchant.",
  })
  @ApiOkResponse({ type: ComplaintListResponseDto })
  @Get()
  listAssigned(
    @CurrentUser("merchantId") merchantId: string,
    @Query() query: ListComplaintsQueryDto,
  ) {
    return this.complaints.listAssigned(
      merchantId,
      query.status,
      query.page,
      query.pageSize,
    );
  }

  // [I18 fix] GET /complaints/assigned/:id — a different segment count
  // than the bare listAssigned() above, so no route-shadowing risk
  // between the two. This is the merchant-scoped mirror of
  // ComplaintsController's CONSUMER-only GET /complaints/:id — merchant-
  // web was calling THAT one and getting 403'd on every complaint (the
  // write side, addMessage, was already open to MERCHANT; the read side
  // never was).
  @ApiOperation({
    summary:
      "Get one complaint assigned to the caller's own merchant, with its message thread.",
  })
  @ApiOkResponse({ type: ComplaintDetailResponseDto })
  @Get(":id")
  getAssigned(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.complaints.getAssigned(merchantId, id);
  }
}
