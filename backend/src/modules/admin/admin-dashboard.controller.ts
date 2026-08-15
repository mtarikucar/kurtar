import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { AdminDashboardService } from "./admin-dashboard.service";

@ApiTags("admin")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("admin/dashboard")
@Actors("ADMIN")
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @ApiOperation({
    summary:
      "Ops counts: pending merchant approvals, complaints/reports at risk, HELD/FAILED settlements, today's GMV.",
  })
  @Get()
  get() {
    return this.dashboard.getDashboard();
  }
}
