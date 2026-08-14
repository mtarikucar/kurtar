import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Actors } from "../auth/decorators/actors.decorator";
import { AdminListSettlementsQueryDto } from "./dto/admin-list-settlements-query.dto";
import { AdminSettlementActionDto } from "./dto/admin-settlement-action.dto";
import { SettlementsService } from "./settlements.service";

@Controller("admin/settlements")
@Actors("ADMIN")
export class AdminSettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  list(@Query() query: AdminListSettlementsQueryDto) {
    return this.settlements.adminList(
      query.status,
      query.merchantId,
      query.page,
      query.pageSize,
    );
  }

  // [Fix round, C1] MUST be registered before the `:id` routes below —
  // NestJS matches routes in declaration order, so "run-nightly" would
  // otherwise be swallowed as an `:id` param by GET/POST .../:id.
  @Post("run-nightly")
  runNightly() {
    return this.settlements.adminRunNightlyCycle();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.settlements.adminGet(id);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string) {
    return this.settlements.adminApprove(id);
  }

  @Post(":id/hold")
  hold(@Param("id") id: string, @Body() dto: AdminSettlementActionDto) {
    return this.settlements.adminHold(id, dto.note);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string) {
    return this.settlements.adminRetry(id);
  }
}
