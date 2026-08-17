import { ApiProperty } from "@nestjs/swagger";

/** [Fix round, Important 5] Documentation-only response shape mirroring
 * AdminDashboardTotals (admin-dashboard.service.ts). */
export class AdminDashboardTodayDto {
  @ApiProperty() gmvCents!: number;
  @ApiProperty() redeemedCount!: number;
}

export class AdminDashboardResponseDto {
  @ApiProperty() pendingMerchantApprovals!: number;
  @ApiProperty() openComplaints!: number;
  @ApiProperty() complaintsSlaAtRisk!: number;
  @ApiProperty() openReports!: number;
  @ApiProperty() settlementBatchesNeedingAttention!: number;
  @ApiProperty({ type: AdminDashboardTodayDto }) today!: AdminDashboardTodayDto;
}
