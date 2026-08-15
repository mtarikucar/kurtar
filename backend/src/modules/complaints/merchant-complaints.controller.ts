import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { ListComplaintsQueryDto } from "./dto/list-complaints-query.dto";
import { ComplaintsService } from "./complaints.service";

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
}
