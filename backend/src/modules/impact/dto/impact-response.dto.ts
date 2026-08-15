import { ApiProperty } from "@nestjs/swagger";

/** [Fix round, Important 5] Documentation-only response shapes mirroring
 * ImpactTotals/PublicImpactTotals (impact.service.ts) field-for-field. */
export class ImpactTotalsDto {
  @ApiProperty() mealsSaved!: number;
  @ApiProperty() co2eGrams!: number;
  @ApiProperty() moneySavedCents!: number;
  @ApiProperty() count!: number;
}

export class PublicImpactTotalsDto extends ImpactTotalsDto {
  @ApiProperty({
    description: "ISO instant this cached aggregate was computed.",
  })
  generatedAt!: string;
}
