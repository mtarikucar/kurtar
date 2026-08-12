import { IsDateString } from "class-validator";

export class ScheduleOfferDto {
  @IsDateString()
  publishAt!: string;
}
