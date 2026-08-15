import { Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { AdminListRatingsQueryDto } from "./dto/admin-list-ratings-query.dto";
import { RatingsService } from "./ratings.service";

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
  @Post(":id/approve")
  approve(@CurrentUser("id") adminId: string, @Param("id") id: string) {
    return this.ratings.adminApprove(adminId, id);
  }

  @ApiOperation({
    summary:
      "Reject a rating — hides it and excludes it from the store's aggregate.",
  })
  @Post(":id/reject")
  reject(@CurrentUser("id") adminId: string, @Param("id") id: string) {
    return this.ratings.rejectRating(adminId, id);
  }

  @ApiOperation({
    summary:
      "Hard-delete a rating (e.g. confirmed spam/fake) and recompute the store's aggregate.",
  })
  @Delete(":id")
  remove(@CurrentUser("id") adminId: string, @Param("id") id: string) {
    return this.ratings.adminDelete(adminId, id);
  }
}
