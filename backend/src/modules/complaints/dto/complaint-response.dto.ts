import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ComplaintCategory,
  ComplaintStatus,
  PrincipalType,
} from "@prisma/client";

/** [Fix round, Important 5] Documentation-only response shapes mirroring
 * ComplaintTicket/ComplaintMessage's raw Prisma field shape (what
 * complaints.service.ts's listMine/getMine/adminList literally return —
 * no select/omit narrows it, so every column is present). */
export class ComplaintTicketDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) merchantId!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) reservationId!:
    string | null;
  @ApiProperty({ enum: ComplaintCategory }) category!: ComplaintCategory;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: ComplaintStatus }) status!: ComplaintStatus;
  @ApiProperty() slaDeadlineAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: Date }) resolvedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  slaWarningSentAt!: Date | null;
  @ApiPropertyOptional({
    nullable: true,
    type: Date,
    description:
      "[I3 fix] Set the moment this ticket's admin refund action succeeded — the single-fire guard against triggering a second refund from the same ticket.",
  })
  refundedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/** [I3 fix] ComplaintsService.adminRefund's response — mirrors
 * ReservationsService.RefundBatchOutcome's shape (ok/refundRef?/error?)
 * plus the reservationId the refund was for. */
export class ComplaintRefundResultDto {
  @ApiProperty() reservationId!: string;
  @ApiProperty() ok!: boolean;
  @ApiPropertyOptional() refundRef?: string;
  @ApiPropertyOptional() error?: string;
}

export class ComplaintMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() complaintId!: string;
  @ApiProperty({ enum: PrincipalType }) authorType!: PrincipalType;
  @ApiProperty() authorId!: string;
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: Date;
}

export class ComplaintListResponseDto {
  @ApiProperty({ type: [ComplaintTicketDto] }) items!: ComplaintTicketDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class ComplaintDetailResponseDto extends ComplaintTicketDto {
  @ApiProperty({ type: [ComplaintMessageDto] })
  messages!: ComplaintMessageDto[];
}

export class AdminComplaintListItemDto extends ComplaintTicketDto {
  @ApiProperty({
    description: "Milliseconds until slaDeadlineAt — negative once breached.",
  })
  slaCountdownMs!: number;
}

export class AdminComplaintListResponseDto {
  @ApiProperty({ type: [AdminComplaintListItemDto] })
  items!: AdminComplaintListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
