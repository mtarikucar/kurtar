import { ApiProperty } from "@nestjs/swagger";

/** [Contract completion] FavoritesService.add/remove return literal
 * `{favorited: true}` / `{favorited: false}` respectively — not a general
 * boolean, so two distinct DTOs rather than one shared shape. */
export class FavoriteAddResponseDto {
  @ApiProperty({ enum: [true] }) favorited!: true;
}

export class FavoriteRemoveResponseDto {
  @ApiProperty({ enum: [false] }) favorited!: false;
}
