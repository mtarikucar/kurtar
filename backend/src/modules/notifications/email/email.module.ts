import { Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { OpsAlertService } from "./ops-alert.service";

@Module({
  providers: [EmailService, OpsAlertService],
  exports: [EmailService, OpsAlertService],
})
export class EmailModule {}
