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
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
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
