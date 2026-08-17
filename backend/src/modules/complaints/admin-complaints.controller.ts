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
import { AdminComplaintActionDto } from "./dto/admin-complaint-action.dto";
import { AdminListComplaintsQueryDto } from "./dto/admin-list-complaints-query.dto";
import {
  AdminComplaintListResponseDto,
  ComplaintDetailResponseDto,
  ComplaintRefundResultDto,
  ComplaintTicketDto,
} from "./dto/complaint-response.dto";
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
      "List complaints with SLA countdown, filterable by status/merchant/category.",
  })
  @ApiOkResponse({ type: AdminComplaintListResponseDto })
  @Get()
  list(@Query() query: AdminListComplaintsQueryDto) {
    return this.complaints.adminList(
      query.status,
      query.merchantId,
      query.category,
      query.page,
      query.pageSize,
    );
  }

  @ApiOperation({
    summary: "Get one complaint (full detail + message thread).",
  })
  @ApiOkResponse({ type: ComplaintDetailResponseDto })
  @Get(":id")
  get(@Param("id") id: string) {
    return this.complaints.adminGet(id);
  }

  @ApiOperation({ summary: "Resolve a complaint." })
  @ApiCreatedResponse({ type: ComplaintTicketDto })
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
  @ApiCreatedResponse({ type: ComplaintTicketDto })
  @Post(":id/escalate")
  escalate(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminComplaintActionDto,
  ) {
    return this.complaints.adminEscalate(adminId, id, dto.note);
  }

  // [I3 fix] The entry point for RefundReason.COMPLAINT — the only way to
  // refund a REDEEMED reservation's payment (see ReservationsService.
  // refundRedeemed's own doc comment for why REDEEMED needed a dedicated
  // path). Deliberately does not also transition the complaint's status;
  // resolve/escalate stay separate calls the admin makes explicitly.
  @ApiOperation({
    summary:
      "Refund this complaint's linked reservation (only valid once it has been REDEEMED) — the admin-initiated make-whole action for a picked-up bad/missing/wrong bag.",
  })
  @ApiCreatedResponse({ type: ComplaintRefundResultDto })
  @Post(":id/refund")
  refund(@CurrentUser("id") adminId: string, @Param("id") id: string) {
    return this.complaints.adminRefund(adminId, id);
  }
}
