import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { ListSettlementsQueryDto } from "./dto/list-settlements-query.dto";
import { SettlementsService } from "./settlements.service";

/** The merchant's own earnings statements — paginated batch list +
 * per-batch line detail. */
@ApiTags("settlements")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("settlements/mine")
@Actors("MERCHANT")
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @ApiOperation({
    summary: "List the calling merchant's own settlement batches, paginated.",
  })
  @Get()
  listMine(
    @CurrentUser("merchantId") merchantId: string,
    @Query() query: ListSettlementsQueryDto,
  ) {
    return this.settlements.listMine(merchantId, query.page, query.pageSize);
  }

  @ApiOperation({
    summary:
      "One settlement batch's line detail + invoices — the earnings statement.",
  })
  @Get(":id")
  getMine(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.settlements.getMineDetail(merchantId, id);
  }
}
