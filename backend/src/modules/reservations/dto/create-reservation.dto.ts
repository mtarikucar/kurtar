import { IsInt, IsString, Max, Min } from "class-validator";

export class CreateReservationDto {
  @IsString()
  offerId!: string;

  // 1-5 per the brief. unitPriceCents/totalCents are ALWAYS computed
  // server-side from BagTemplate.priceCents — this DTO never carries a
  // price field, so there is nothing here for a client to lie about.
  @IsInt()
  @Min(1)
  @Max(5)
  qty!: number;
}
