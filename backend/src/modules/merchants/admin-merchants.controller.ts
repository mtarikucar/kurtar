import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AdminListMerchantsQueryDto } from "./dto/admin-list-merchants-query.dto";
import { AdminMerchantActionDto } from "./dto/admin-merchant-action.dto";
import { MerchantsService } from "./merchants.service";

@Controller("admin/merchants")
@Actors("ADMIN")
export class AdminMerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get()
  list(@Query() query: AdminListMerchantsQueryDto) {
    return this.merchants.adminList(query.status, query.page, query.pageSize);
  }

  @Post(":id/approve")
  approve(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminMerchantActionDto,
  ) {
    return this.merchants.adminApprove(adminId, id, dto.note);
  }

  @Post(":id/reject")
  reject(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminMerchantActionDto,
  ) {
    return this.merchants.adminReject(adminId, id, dto.note);
  }

  @Post(":id/suspend")
  suspend(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminMerchantActionDto,
  ) {
    return this.merchants.adminSuspend(adminId, id, dto.note);
  }
}
