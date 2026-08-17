import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { ReportTargetType } from "@prisma/client";

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType })
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @ApiProperty({
    description: "The id of the Rating/Store/DailyOffer being reported.",
  })
  @IsString()
  @MinLength(1)
  targetId!: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
