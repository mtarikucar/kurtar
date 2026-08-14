import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { SettlementStatus } from "@prisma/client";

export class AdminListSettlementsQueryDto {
  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;

  @IsOptional()
  @IsString()
  merchantId?: string;

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
