import { Module } from "@nestjs/common";
import { EmailModule } from "../notifications/email/email.module";
import { AdminComplaintsController } from "./admin-complaints.controller";
import { ComplaintsController } from "./complaints.controller";
import { MerchantComplaintsController } from "./merchant-complaints.controller";
import { ComplaintsService } from "./complaints.service";
import { ComplaintSlaCronService } from "./complaint-sla-cron.service";

@Module({
  imports: [EmailModule],
  controllers: [
    ComplaintsController,
    MerchantComplaintsController,
    AdminComplaintsController,
  ],
  providers: [ComplaintsService, ComplaintSlaCronService],
})
export class ComplaintsModule {}
