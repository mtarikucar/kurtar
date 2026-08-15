import { Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { AdminListRatingsQueryDto } from "./dto/admin-list-ratings-query.dto";
import { RatingsService } from "./ratings.service";
import {
  AdminRatingListResponseDto,
  RatingDto,
} from "./dto/rating-response.dto";

/** Admin ratings moderation surface — the "until an admin acts" half of
 * the visibility policy (ratings.service.ts's doc comment): a commented
 * rating sits PENDING until an admin approves or rejects it here. */
@ApiTags("admin")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("admin/ratings")
@Actors("ADMIN")
export class AdminRatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @ApiOperation({
    summary:
      "List ratings, filterable by moderation status/store — the moderation queue.",
  })
  @ApiOkResponse({ type: AdminRatingListResponseDto })
  @Get()
  list(@Query() query: AdminListRatingsQueryDto) {
    return this.ratings.adminList(
      query.status,
      query.storeId,
      query.page,
      query.pageSize,
    );
  }

  @ApiOperation({
    summary:
      "Approve a PENDING rating — it starts counting toward the store's aggregate.",
  })
  @ApiCreatedResponse({ type: RatingDto })
  @Post(":id/approve")
  approve(@CurrentUser("id") adminId: string, @Param("id") id: string) {
    return this.ratings.adminApprove(adminId, id);
  }

  @ApiOperation({
    summary:
      "Reject a rating — hides it and excludes it from the store's aggregate.",
  })
  @ApiCreatedResponse({ type: RatingDto })
  @Post(":id/reject")
  reject(@CurrentUser("id") adminId: string, @Param("id") id: string) {
    return this.ratings.rejectRating(adminId, id);
  }

  // [Contract completion] adminDelete() returns void — a genuine 200 with
  // NO body (no @HttpCode override here, so Nest's DELETE default of 200
  // applies; there is no response schema to declare because there is
  // nothing in the body, this is not a gap). Documented explicitly via
  // ApiResponse rather than left silently bare so it reads as "checked,
  // deliberately empty" rather than "never looked at" — see this
  // operationId's entry in scripts/check-openapi-response-types.ts's
  // documented KNOWN_EMPTY_RESPONSES allowlist for the other half of that
  // distinction (the drift-gate script itself).
  @ApiOperation({
    summary:
      "Hard-delete a rating (e.g. confirmed spam/fake) and recompute the store's aggregate.",
  })
  @ApiResponse({ status: 200, description: "No response body." })
  @Delete(":id")
  remove(@CurrentUser("id") adminId: string, @Param("id") id: string) {
    return this.ratings.adminDelete(adminId, id);
  }
}
