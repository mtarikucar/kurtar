import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { MerchantVerificationStatus } from "@prisma/client";

export class AdminListMerchantsQueryDto {
  @ApiPropertyOptional({ enum: MerchantVerificationStatus })
  @IsOptional()
  @IsEnum(MerchantVerificationStatus)
  status?: MerchantVerificationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
