import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
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
import { AdminListMerchantsQueryDto } from "./dto/admin-list-merchants-query.dto";
import { AdminMerchantActionDto } from "./dto/admin-merchant-action.dto";
import { MerchantsService } from "./merchants.service";
import {
  AdminMerchantListResponseDto,
  MerchantSuspendResponseDto,
  MerchantTransitionResponseDto,
} from "./dto/merchant-response.dto";

@ApiTags("admin")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("admin/merchants")
@Actors("ADMIN")
export class AdminMerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @ApiOperation({
    summary: "List merchants, filterable by verification status.",
  })
  @ApiOkResponse({ type: AdminMerchantListResponseDto })
  @Get()
  list(@Query() query: AdminListMerchantsQueryDto) {
    return this.merchants.adminList(query.status, query.page, query.pageSize);
  }

  @ApiOperation({ summary: "Approve a merchant's KYC submission." })
  @ApiCreatedResponse({ type: MerchantTransitionResponseDto })
  @Post(":id/approve")
  approve(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminMerchantActionDto,
  ) {
    return this.merchants.adminApprove(adminId, id, dto.note);
  }

  @ApiOperation({ summary: "Reject a merchant's KYC submission." })
  @ApiCreatedResponse({ type: MerchantTransitionResponseDto })
  @Post(":id/reject")
  reject(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminMerchantActionDto,
  ) {
    return this.merchants.adminReject(adminId, id, dto.note);
  }

  @ApiOperation({
    summary:
      "Suspend a merchant — cancels all of its active offers (Task 5 fan-out).",
  })
  @ApiCreatedResponse({ type: MerchantSuspendResponseDto })
  @Post(":id/suspend")
  suspend(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminMerchantActionDto,
  ) {
    return this.merchants.adminSuspend(adminId, id, dto.note);
  }
}
