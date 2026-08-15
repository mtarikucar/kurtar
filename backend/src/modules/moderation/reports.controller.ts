import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { CreateReportDto } from "./dto/create-report.dto";
import { ModerationService } from "./moderation.service";

// @Public (see moderation.service.ts's doc comment for the "pick and
// justify" reasoning) — an anonymous flood of reports is the real risk
// this throttle bounds, since the endpoint has no per-user identity to
// key off of; 5/min is generous for a genuine one-off report and tight
// enough to make a scripted spam flood expensive.
const REPORT_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags("moderation")
@Controller("reports")
@Public()
export class ReportsController {
  constructor(private readonly moderation: ModerationService) {}

  @ApiOperation({
    summary:
      "Report a STORE/OFFER/RATING for review (48h takedown SLA starts now). No auth required — heavily throttled instead.",
  })
  @Throttle(REPORT_THROTTLE)
  @Post()
  create(@Body() dto: CreateReportDto) {
    return this.moderation.create(dto);
  }
}
