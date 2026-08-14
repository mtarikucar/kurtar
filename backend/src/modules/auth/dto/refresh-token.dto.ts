import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Body for POST /auth/refresh and POST /auth/logout. Optional because the
 * web-panel transport presents the token via the httpOnly cookie instead —
 * see auth.controller.ts's dual-transport handling.
 */
export class RefreshTokenBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  refreshToken?: string;
}
