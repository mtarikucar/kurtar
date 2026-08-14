import { Controller, Get, Param, Query } from "@nestjs/common";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ListSettlementsQueryDto } from "./dto/list-settlements-query.dto";
import { SettlementsService } from "./settlements.service";

/** The merchant's own earnings statements — paginated batch list +
 * per-batch line detail. */
@Controller("settlements/mine")
@Actors("MERCHANT")
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  listMine(
    @CurrentUser("merchantId") merchantId: string,
    @Query() query: ListSettlementsQueryDto,
  ) {
    return this.settlements.listMine(merchantId, query.page, query.pageSize);
  }

  @Get(":id")
  getMine(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.settlements.getMineDetail(merchantId, id);
  }
}
