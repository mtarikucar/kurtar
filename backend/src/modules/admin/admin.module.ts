import { Module } from "@nestjs/common";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminExportsController } from "./admin-exports.controller";
import { AdminExportsService } from "./admin-exports.service";

@Module({
  controllers: [AdminDashboardController, AdminExportsController],
  providers: [AdminDashboardService, AdminExportsService],
})
export class AdminModule {}
