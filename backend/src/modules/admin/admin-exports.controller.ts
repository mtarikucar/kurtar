import { Controller, Get, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { Actors } from "../auth/decorators/actors.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { ApiCsvExportResponse } from "../../common/swagger/api-csv-export-response.decorator";
import { AdminExportRangeQueryDto } from "./dto/admin-export-range-query.dto";
import { AdminExportsService } from "./admin-exports.service";

// [Fix round, Important 4] No class-level @ApiProduces — see
// ApiCsvExportResponse's own doc comment for why that made the spec
// claim the JSON error responses were CSV. Each route below declares its
// own 200 content type explicitly instead.
@ApiTags("admin")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("admin/exports")
@Actors("ADMIN")
export class AdminExportsController {
  constructor(private readonly exports: AdminExportsService) {}

  @ApiOperation({
    summary:
      "Stream a CSV of complaints (optionally filtered by createdAt range) — the ETAHS evidence trail.",
  })
  @ApiCsvExportResponse("A streamed complaints.csv file.")
  @Get("complaints.csv")
  async complaintsCsv(
    @Query() query: AdminExportRangeQueryDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    await this.exports.streamComplaintsCsv(res, query);
  }

  @ApiOperation({
    summary:
      "Stream a CSV of settlement batches (optionally filtered by createdAt range).",
  })
  @ApiCsvExportResponse("A streamed settlements.csv file.")
  @Get("settlements.csv")
  async settlementsCsv(
    @Query() query: AdminExportRangeQueryDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    await this.exports.streamSettlementsCsv(res, query);
  }

  @ApiOperation({
    summary:
      "Stream a CSV of merchants (optionally filtered by createdAt range).",
  })
  @ApiCsvExportResponse("A streamed merchants.csv file.")
  @Get("merchants.csv")
  async merchantsCsv(
    @Query() query: AdminExportRangeQueryDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    await this.exports.streamMerchantsCsv(res, query);
  }
}
