import { Module } from "@nestjs/common";
import {
  MyFavoritesController,
  StoreFavoritesController,
} from "./favorites.controller";
import { FavoritesService } from "./favorites.service";

@Module({
  controllers: [StoreFavoritesController, MyFavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
