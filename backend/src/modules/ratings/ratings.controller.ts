import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { RatingsMineQueryDto } from "./dto/ratings-mine-query.dto";
import { RatingsService } from "./ratings.service";
import { RatingsMineResponseDto } from "./dto/rating-response.dto";

@ApiTags("ratings")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("ratings")
@Actors("MERCHANT")
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @ApiOperation({
    summary:
      "Recent ratings + star distribution for one of the caller's own stores.",
  })
  @ApiOkResponse({ type: RatingsMineResponseDto })
  @Get("mine")
  listMine(
    @CurrentUser("merchantId") merchantId: string,
    @Query() query: RatingsMineQueryDto,
  ) {
    return this.ratings.listMine(
      merchantId,
      query.storeId,
      query.page,
      query.pageSize,
    );
  }
}
