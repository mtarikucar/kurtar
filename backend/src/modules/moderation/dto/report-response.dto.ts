import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ReportStatus, ReportTargetType } from "@prisma/client";

/** [Contract completion] The raw ContentReport Prisma model — create()/
 * adminAction()/adminDismiss() all return it unmodified. */
export class ContentReportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ReportTargetType }) targetType!: ReportTargetType;
  @ApiProperty() targetId!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: ReportStatus }) status!: ReportStatus;
  @ApiProperty() takedownDeadlineAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: Date }) resolvedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  takedownWarningSentAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  takedownBreachedSentAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class AdminReportListItemDto extends ContentReportDto {
  @ApiProperty({
    description:
      "Milliseconds until takedownDeadlineAt — negative once breached.",
  })
  takedownCountdownMs!: number;
}

export class AdminReportListResponseDto {
  @ApiProperty({ type: [AdminReportListItemDto] })
  items!: AdminReportListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
