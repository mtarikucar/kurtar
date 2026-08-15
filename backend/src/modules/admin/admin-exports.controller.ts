import { Controller, Get, Query, Res } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import { Response } from "express";
import { Actors } from "../auth/decorators/actors.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { AdminExportRangeQueryDto } from "./dto/admin-export-range-query.dto";
import { AdminExportsService } from "./admin-exports.service";

@ApiTags("admin")
@ApiBearerAuth()
@ApiStandardErrors()
@ApiProduces("text/csv")
@Controller("admin/exports")
@Actors("ADMIN")
export class AdminExportsController {
  constructor(private readonly exports: AdminExportsService) {}

  @ApiOperation({
    summary:
      "Stream a CSV of complaints (optionally filtered by createdAt range) — the ETAHS evidence trail.",
  })
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
  @Get("merchants.csv")
  async merchantsCsv(
    @Query() query: AdminExportRangeQueryDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    await this.exports.streamMerchantsCsv(res, query);
  }
}
