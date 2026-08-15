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
import { AdminListReportsQueryDto } from "./dto/admin-list-reports-query.dto";
import { AdminReportActionDto } from "./dto/admin-report-action.dto";
import { ModerationService } from "./moderation.service";
import {
  AdminReportListResponseDto,
  ContentReportDto,
} from "./dto/report-response.dto";

@ApiTags("admin")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("admin/reports")
@Actors("ADMIN")
export class AdminReportsController {
  constructor(private readonly moderation: ModerationService) {}

  @ApiOperation({
    summary:
      "List content reports with takedown-deadline countdown, filterable by status/target type.",
  })
  @ApiOkResponse({ type: AdminReportListResponseDto })
  @Get()
  list(@Query() query: AdminListReportsQueryDto) {
    return this.moderation.adminList(
      query.status,
      query.targetType,
      query.page,
      query.pageSize,
    );
  }

  @ApiOperation({
    summary:
      "Act on a report — hides the rating / deactivates the store / cancels the offer, per targetType.",
  })
  @ApiCreatedResponse({ type: ContentReportDto })
  @Post(":id/action")
  action(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminReportActionDto,
  ) {
    return this.moderation.adminAction(adminId, id, dto.note);
  }

  @ApiOperation({ summary: "Dismiss a report without acting on its target." })
  @ApiCreatedResponse({ type: ContentReportDto })
  @Post(":id/dismiss")
  dismiss(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminReportActionDto,
  ) {
    return this.moderation.adminDismiss(adminId, id, dto.note);
  }
}
