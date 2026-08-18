import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { InvoiceStatus } from "@prisma/client";

/** [Cross-lane fix, M16] Query for GET /api/admin/invoices — the DRAFT
 * queue's own filter. `status` is optional so the same endpoint answers
 * "show me everything for this merchant" too, but the screen that drives
 * it asks for DRAFT: that is the state a failed e-document issuance
 * leaves behind, and the state nothing in the product could see. */
export class AdminListInvoicesQueryDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
