import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BagCategory, DietFlag } from "@prisma/client";

/** [Contract completion] The raw BagTemplate Prisma model — create/list/
 * get/update/deactivate all return it unmodified (deactivate is a plain
 * `bagTemplate.update({data:{active:false}})`, so it returns the updated
 * row too, NOT an empty/204 response — genuinely 200 with a body). */
export class BagTemplateDto {
  @ApiProperty() id!: string;
  @ApiProperty() storeId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: BagCategory }) category!: BagCategory;
  @ApiProperty({ enum: DietFlag, isArray: true }) dietFlags!: DietFlag[];
  @ApiProperty() allergenDisclaimer!: string;
  @ApiProperty() originalValueCentsMin!: number;
  @ApiProperty() originalValueCentsMax!: number;
  @ApiProperty() priceCents!: number;
  @ApiPropertyOptional({ nullable: true, type: String })
  description!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
