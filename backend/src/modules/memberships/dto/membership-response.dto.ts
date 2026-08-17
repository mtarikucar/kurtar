import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MembershipStatus } from "@prisma/client";

/** [Contract completion] GET /merchants/me/membership —
 * MembershipsService.getMine's MembershipMineView interface. Note the
 * source interface types `status` as plain `string`, but the real runtime
 * value is always a MembershipStatus (it's read straight off
 * MembershipSubscription.status, a real Prisma enum column) — documented
 * as the enum here since that's what every value actually is. */
export class MembershipMineResponseDto {
  @ApiProperty({ enum: MembershipStatus }) status!: MembershipStatus;
  @ApiProperty() anchorDate!: Date;
  @ApiProperty() currentPeriodStart!: Date;
  @ApiProperty() currentPeriodEnd!: Date;
  @ApiProperty() priceCents!: number;
  @ApiProperty() vatCents!: number;
  @ApiProperty() outstandingCents!: number;
  @ApiProperty() outstandingVatCents!: number;
  @ApiProperty() writtenOffCents!: number;
  @ApiPropertyOptional({ nullable: true, type: Date })
  periodPaidAt!: Date | null;
  @ApiProperty() nextAnniversary!: Date;
}
