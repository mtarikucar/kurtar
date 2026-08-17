import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MerchantUserRole, UserStatus } from "@prisma/client";

/**
 * [Contract completion] Response shapes for the 4 token-issuing auth
 * operations (otp/verify, merchant/login, admin/login, refresh) plus
 * otp/request and logout. Derived from AuthService's own AuthResult
 * interface (extends TokenService's IssuedTokens) and each call site's
 * literal `user: {...}` object — auth.service.ts's three call sites
 * (verifyConsumerOtp/merchantLogin/adminLogin) each build a DIFFERENT
 * `user` shape, so this is three response DTOs, not one generic.
 *
 * `refreshToken`/`refreshTokenExpiresAt` are documented as OPTIONAL, not
 * a gap — this mirrors real, deliberate runtime behavior: AuthController's
 * respond() strips both from the JSON body whenever the caller declared
 * cookie transport (`X-Client-Transport: cookie`), since the refresh
 * token already went out as an httpOnly cookie and repeating it in
 * JS-readable JSON would defeat that cookie's XSS protection for exactly
 * the token it exists to protect. `@kurtar/api-client`'s own hand-typed
 * `AuthTokens` (packages/api-client/src/transport.ts — the ONE deliberate
 * shape override the client makes, per docs/frontend-contract.md §9)
 * already models this the same way.
 */
export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiPropertyOptional({
    description:
      "Omitted when the caller declared cookie transport (X-Client-Transport: cookie) — the refresh token went out as an httpOnly cookie instead.",
  })
  refreshToken?: string;
  @ApiPropertyOptional({
    type: Date,
    description: "Omitted under the same condition as refreshToken.",
  })
  refreshTokenExpiresAt?: Date;
}

export class ConsumerAuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiPropertyOptional({ nullable: true, type: String }) name!: string | null;
}

export class MerchantAuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: MerchantUserRole }) role!: MerchantUserRole;
  @ApiProperty() merchantId!: string;
}

export class AdminAuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
}

export class ConsumerAuthResponseDto extends AuthTokensDto {
  @ApiProperty({ type: ConsumerAuthUserDto }) user!: ConsumerAuthUserDto;
}

export class MerchantAuthResponseDto extends AuthTokensDto {
  @ApiProperty({ type: MerchantAuthUserDto }) user!: MerchantAuthUserDto;
}

export class AdminAuthResponseDto extends AuthTokensDto {
  @ApiProperty({ type: AdminAuthUserDto }) user!: AdminAuthUserDto;
}

/** POST /auth/otp/request — OtpService.OtpRequestResult. */
export class OtpRequestResponseDto {
  @ApiProperty() expiresAt!: Date;
}

/** POST /auth/logout — always `{success: true}` (auth.controller.ts's
 * logout() has no branch that returns anything else). */
export class LogoutResponseDto {
  @ApiProperty() success!: boolean;
}
