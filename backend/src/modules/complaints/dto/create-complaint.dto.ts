import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ComplaintCategory } from "@prisma/client";

export class CreateComplaintDto {
  @ApiProperty({ enum: ComplaintCategory })
  @IsEnum(ComplaintCategory)
  category!: ComplaintCategory;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description!: string;

  @ApiPropertyOptional({
    description:
      "If set, merchantId is derived from the reservation's store (any client-supplied merchantId is ignored).",
  })
  @IsOptional()
  @IsString()
  reservationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantId?: string;
}
