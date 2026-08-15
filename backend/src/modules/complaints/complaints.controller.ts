import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedPrincipal } from "../auth/strategies/jwt.strategy";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { CreateComplaintDto } from "./dto/create-complaint.dto";
import { CreateComplaintMessageDto } from "./dto/create-complaint-message.dto";
import { ListComplaintsQueryDto } from "./dto/list-complaints-query.dto";
import {
  ComplaintDetailResponseDto,
  ComplaintListResponseDto,
  ComplaintTicketDto,
} from "./dto/complaint-response.dto";
import { ComplaintsService } from "./complaints.service";

@ApiTags("complaints")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("complaints")
@Actors("CONSUMER")
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @ApiOperation({
    summary: "File a complaint (ETAHS 15-calendar-day SLA starts now).",
  })
  // [Fix round 2] A bare @Post() with no @HttpCode override returns 201 at
  // runtime (Nest's own default) — @ApiOkResponse (a 200) described a
  // status this route never actually sends, leaving the REAL 201 bare
  // with no schema in the generated spec. @ApiCreatedResponse documents
  // the response under the status code the server genuinely returns.
  @ApiCreatedResponse({ type: ComplaintTicketDto })
  @Post()
  create(@CurrentUser("id") userId: string, @Body() dto: CreateComplaintDto) {
    return this.complaints.create(userId, dto);
  }

  @ApiOperation({ summary: "List the caller's own complaints, paginated." })
  @ApiOkResponse({ type: ComplaintListResponseDto })
  @Get("mine")
  listMine(
    @CurrentUser("id") userId: string,
    @Query() query: ListComplaintsQueryDto,
  ) {
    return this.complaints.listMine(userId, query.page, query.pageSize);
  }

  @ApiOperation({
    summary: "Get one of the caller's own complaints, with its message thread.",
  })
  @ApiOkResponse({ type: ComplaintDetailResponseDto })
  @Get(":id")
  getMine(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.complaints.getMine(userId, id);
  }

  // [Judgment call, mirrors reservations.controller.ts's redeem()]
  // Reachable by any of the three actor types — actual authorization
  // ("who may post to which thread") lives in
  // ComplaintsService.assertCanMessage, not here. Exempted from
  // MerchantApprovalGuard's default-deny for the same reasoning
  // redeem() documents: this doesn't create new business for a
  // suspended merchant, it lets them respond to a trust-and-safety
  // matter that already exists — blocking it would strand a legitimate
  // defense/reply while an admin is still deciding the merchant's fate.
  @ApiOperation({
    summary:
      "Post to a complaint's thread (CONSUMER owner, assigned MERCHANT, or ADMIN). A MERCHANT reply also flips OPEN -> MERCHANT_RESPONDED.",
  })
  @Actors("CONSUMER", "MERCHANT", "ADMIN")
  @AllowUnapprovedMerchant()
  @Post(":id/messages")
  addMessage(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("id") id: string,
    @Body() dto: CreateComplaintMessageDto,
  ) {
    return this.complaints.addMessage(user, id, dto.body);
  }
}
