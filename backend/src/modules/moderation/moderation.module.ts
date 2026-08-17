import { Module } from "@nestjs/common";
import { EmailModule } from "../notifications/email/email.module";
import { RatingsModule } from "../ratings/ratings.module";
import { StoresModule } from "../stores/stores.module";
import { OffersModule } from "../offers/offers.module";
import { AdminReportsController } from "./admin-reports.controller";
import { ReportsController } from "./reports.controller";
import { ModerationService } from "./moderation.service";
import { ModerationTakedownCronService } from "./moderation-takedown-cron.service";

@Module({
  imports: [EmailModule, RatingsModule, StoresModule, OffersModule],
  controllers: [ReportsController, AdminReportsController],
  providers: [ModerationService, ModerationTakedownCronService],
})
export class ModerationModule {}
