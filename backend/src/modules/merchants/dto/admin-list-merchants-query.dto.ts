import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { MerchantVerificationStatus } from "@prisma/client";

export class AdminListMerchantsQueryDto {
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
