import { Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { ListFavoritesQueryDto } from "./dto/list-favorites-query.dto";
import { FavoriteListResponseDto } from "./dto/favorite-list-response.dto";
import { FavoritesService } from "./favorites.service";

@ApiTags("favorites")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("stores/:storeId/favorites")
@Actors("CONSUMER")
export class StoreFavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @ApiOperation({
    summary: "Favorite a store. Idempotent — repeating it is a no-op.",
  })
  @Post()
  add(@CurrentUser("id") userId: string, @Param("storeId") storeId: string) {
    return this.favorites.add(userId, storeId);
  }

  @ApiOperation({
    summary: "Unfavorite a store. Idempotent — repeating it is a no-op.",
  })
  @Delete()
  remove(@CurrentUser("id") userId: string, @Param("storeId") storeId: string) {
    return this.favorites.remove(userId, storeId);
  }
}

@ApiTags("favorites")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("me/favorites")
@Actors("CONSUMER")
export class MyFavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @ApiOperation({
    summary:
      "List the caller's own favorited stores, each flagged with whether it has a live offer today.",
  })
  @ApiOkResponse({ type: FavoriteListResponseDto })
  @Get()
  listMine(
    @CurrentUser("id") userId: string,
    @Query() query: ListFavoritesQueryDto,
  ) {
    return this.favorites.listMine(userId, query.page, query.pageSize);
  }
}
