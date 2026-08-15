import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { AdminComplaintActionDto } from "./dto/admin-complaint-action.dto";
import { AdminListComplaintsQueryDto } from "./dto/admin-list-complaints-query.dto";
import { ComplaintsService } from "./complaints.service";

@ApiTags("admin")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("admin/complaints")
@Actors("ADMIN")
export class AdminComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @ApiOperation({
    summary:
      "List complaints with SLA countdown, filterable by status/merchant.",
  })
  @Get()
  list(@Query() query: AdminListComplaintsQueryDto) {
    return this.complaints.adminList(
      query.status,
      query.merchantId,
      query.page,
      query.pageSize,
    );
  }

  @ApiOperation({
    summary: "Get one complaint (full detail + message thread).",
  })
  @Get(":id")
  get(@Param("id") id: string) {
    return this.complaints.adminGet(id);
  }

  @ApiOperation({ summary: "Resolve a complaint." })
  @Post(":id/resolve")
  resolve(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminComplaintActionDto,
  ) {
    return this.complaints.adminResolve(adminId, id, dto.note);
  }

  @ApiOperation({
    summary:
      "Manually escalate a complaint (the SLA cron also does this automatically on breach).",
  })
  @Post(":id/escalate")
  escalate(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminComplaintActionDto,
  ) {
    return this.complaints.adminEscalate(adminId, id, dto.note);
  }
}
