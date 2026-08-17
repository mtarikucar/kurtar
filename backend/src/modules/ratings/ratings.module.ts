import { Module } from "@nestjs/common";
import { AdminRatingsController } from "./admin-ratings.controller";
import { RatingsController } from "./ratings.controller";
import { ReservationRatingController } from "./reservation-rating.controller";
import { RatingsService } from "./ratings.service";

@Module({
  controllers: [
    ReservationRatingController,
    RatingsController,
    AdminRatingsController,
  ],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
