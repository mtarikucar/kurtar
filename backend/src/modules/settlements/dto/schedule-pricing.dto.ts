import { Type } from "class-transformer";
import { IsDate, IsInt, Min } from "class-validator";

export class SchedulePricingDto {
  @IsInt()
  @Min(0)
  bagFeeCents!: number;

  @IsInt()
  @Min(0)
  membershipAnnualCents!: number;

  @Type(() => Date)
  @IsDate()
  effectiveFrom!: Date;
}
