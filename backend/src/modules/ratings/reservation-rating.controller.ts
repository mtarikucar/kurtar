import { Body, Controller, Param, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { CreateRatingDto } from "./dto/create-rating.dto";
import { RatingsService } from "./ratings.service";
import { RatingDto } from "./dto/rating-response.dto";

/** POST /api/reservations/:id/rating — lives under the reservations URL
 * prefix (matches the brief's literal endpoint) but is owned by
 * modules/ratings, same as ratings.controller.ts. */
@ApiTags("ratings")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("reservations")
@Actors("CONSUMER")
export class ReservationRatingController {
  constructor(private readonly ratings: RatingsService) {}

  @ApiOperation({
    summary:
      "Rate a REDEEMED reservation. Once per reservation — a repeat call gets 409.",
  })
  @ApiCreatedResponse({ type: RatingDto })
  @Post(":id/rating")
  create(
    @CurrentUser("id") userId: string,
    @Param("id") reservationId: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.ratings.create(userId, reservationId, dto);
  }
}
