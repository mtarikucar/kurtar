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
import { AdminListSettlementsQueryDto } from "./dto/admin-list-settlements-query.dto";
import { AdminSettlementActionDto } from "./dto/admin-settlement-action.dto";
import { SettlementsService } from "./settlements.service";
import {
  AdminSettlementDetailResponseDto,
  AdminSettlementListResponseDto,
  RunNightlyCycleResponseDto,
} from "./dto/settlement-response.dto";

@ApiTags("admin")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("admin/settlements")
@Actors("ADMIN")
export class AdminSettlementsController {
  // [Fix round #6, I5] Every mutating handler here binds the acting admin
  // and threads it into the service, which writes an AuditLog row in the
  // same transaction as the state change. Approve is what the payout cron
  // picks up to move money to a merchant IBAN; before this, none of these
  // four left any record of who acted — the only admin mutations in the
  // codebase that did not.
  constructor(private readonly settlements: SettlementsService) {}

  @ApiOperation({
    summary: "List settlement batches, filterable by status/merchant.",
  })
  @ApiOkResponse({ type: AdminSettlementListResponseDto })
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
  @ApiOperation({
    summary:
      "Run the nightly settlement batch cycle on demand (also runs automatically at 02:00 Istanbul).",
  })
  @ApiCreatedResponse({ type: RunNightlyCycleResponseDto })
  @Post("run-nightly")
  runNightly(@CurrentUser("id") adminId: string) {
    return this.settlements.adminRunNightlyCycle(adminId);
  }

  @ApiOperation({ summary: "Get one settlement batch (full detail)." })
  @ApiOkResponse({ type: AdminSettlementDetailResponseDto })
  @Get(":id")
  get(@Param("id") id: string) {
    return this.settlements.adminGet(id);
  }

  @ApiOperation({ summary: "Approve a CALCULATED batch for payout." })
  @ApiCreatedResponse({ type: AdminSettlementDetailResponseDto })
  @Post(":id/approve")
  approve(@CurrentUser("id") adminId: string, @Param("id") id: string) {
    return this.settlements.adminApprove(id, adminId);
  }

  @ApiOperation({
    summary: "Pause a batch (HELD), e.g. to investigate before it pays out.",
  })
  @ApiCreatedResponse({ type: AdminSettlementDetailResponseDto })
  @Post(":id/hold")
  hold(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: AdminSettlementActionDto,
  ) {
    return this.settlements.adminHold(id, dto.note, adminId);
  }

  @ApiOperation({
    summary: "Recompute a HELD batch and retry payout if it's now APPROVED.",
  })
  @ApiCreatedResponse({ type: AdminSettlementDetailResponseDto })
  @Post(":id/retry")
  retry(@CurrentUser("id") adminId: string, @Param("id") id: string) {
    return this.settlements.adminRetry(id, adminId);
  }
}
