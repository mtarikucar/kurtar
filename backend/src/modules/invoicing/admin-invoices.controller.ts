import { Controller, Get, Param, Post, Query } from "@nestjs/common";
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
import { AdminListInvoicesQueryDto } from "./dto/admin-list-invoices-query.dto";
import {
  AdminCommissionInvoiceListResponseDto,
  AdminCommissionInvoiceReissueResponseDto,
} from "./dto/admin-invoice-response.dto";
import { CommissionInvoiceService } from "./commission-invoice.service";

/**
 * [Cross-lane fix, M16] The commission-invoice queue.
 *
 * A commission e-invoice that fails issuance stays DRAFT. The outbox
 * retries it and a daily sweep emails ops about anything still DRAFT
 * hours later — but until this controller there was no ENDPOINT that
 * listed invoices at all, so nothing in the product could show an
 * operator what was stuck, and nothing could act on it: the only recovery
 * was to wait for a retry ladder that had already been exhausted.
 *
 * Two routes, both admin-only: see the DRAFT queue, and re-issue one row.
 */
@ApiTags("admin")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("admin/invoices")
@Actors("ADMIN")
export class AdminInvoicesController {
  constructor(private readonly invoices: CommissionInvoiceService) {}

  @ApiOperation({
    summary:
      "List commission invoices, filterable by status/merchant — the DRAFT queue an operator works when e-document issuance fails.",
  })
  @ApiOkResponse({ type: AdminCommissionInvoiceListResponseDto })
  @Get()
  list(@Query() query: AdminListInvoicesQueryDto) {
    return this.invoices.adminList(
      query.status,
      query.merchantId,
      query.page,
      query.pageSize,
    );
  }

  @ApiOperation({
    summary:
      "Re-issue one DRAFT commission invoice at the e-document provider. Uses the SAME invoice id, which the provider contract dedupes, so this can never mint a second e-fatura.",
  })
  @ApiCreatedResponse({ type: AdminCommissionInvoiceReissueResponseDto })
  @Post(":id/reissue")
  reissue(@CurrentUser("id") adminId: string, @Param("id") id: string) {
    return this.invoices.adminReissue(id, adminId);
  }
}
