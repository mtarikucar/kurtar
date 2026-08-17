import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** [Contract completion] The raw NotificationPreference Prisma model —
 * getOrCreate()/update() both return it unmodified. */
export class NotificationPreferenceDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() favoritesEnabled!: boolean;
  @ApiProperty() nearbyEnabled!: boolean;
  @ApiProperty() nearbyRadiusM!: number;
  @ApiProperty() marketingEnabled!: boolean;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: "Local hour-of-day [0-23].",
  })
  quietHoursStart!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  quietHoursEnd!: number | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
