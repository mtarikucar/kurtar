import { IsOptional, IsString } from "class-validator";

export class ListBagTemplatesQueryDto {
  @IsOptional()
  @IsString()
  storeId?: string;
}
