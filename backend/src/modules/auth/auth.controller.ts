import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { TokenService, IssuedTokens } from "./services/token.service";
import { OtpRequestDto } from "./dto/otp-request.dto";
import { OtpVerifyDto } from "./dto/otp-verify.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenBodyDto } from "./dto/refresh-token.dto";
import { Public } from "./decorators/public.decorator";

// Per-route throttle tiers for the auth surface. All auth endpoints are
// either unauthenticated (@Public) or credential/OTP-bearing, so every one
// gets a tier tighter than the "default" 300/min global profile — mirrors
// kds's backend/src/modules/auth/auth.controller.ts LOGIN_THROTTLE /
// REFRESH_THROTTLE pattern.
const OTP_REQUEST_THROTTLE = { default: { limit: 3, ttl: 60_000 } };
const OTP_VERIFY_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const LOGIN_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const REFRESH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

// Refresh-token cookie. Path scopes it to the auth surface only; httpOnly
// blocks JS access (XSS mitigation); sameSite: strict blocks CSRF; secure
// is on outside development. Mirrors kds's
// backend/src/modules/auth/auth.controller.ts convention exactly.
const REFRESH_COOKIE = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/auth";

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

/**
 * Strip the refresh token from the JSON body so it travels only in the
 * httpOnly cookie for callers already using cookie transport. Mobile
 * (React Native SecureStore) callers have no cookie jar in that sense, so
 * they keep receiving it in the body — see respond() below.
 */
function stripRefreshToken<T extends { refreshToken: string }>(
  result: T,
): Omit<T, "refreshToken"> {
  const { refreshToken: _r, ...rest } = result;
  return rest;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Sets the refresh cookie on every response (harmless for callers that
   * ignore it) and, per the brief's dual-transport requirement, ALSO
   * returns the raw refresh token in the JSON body for the mobile
   * consumer app (documented target: RN SecureStore, which has no browser
   * cookie jar) — UNLESS `stripBody` is set, which the /refresh handler
   * uses when the caller demonstrably already authenticated via the
   * cookie (a web-panel session): that caller's next refresh token is
   * already in the fresh cookie, so repeating it in JS-readable JSON adds
   * exposure for no benefit (kds's stripRefreshToken pattern).
   */
  private respond<T extends IssuedTokens>(
    res: Response,
    result: T,
    stripBody = false,
  ) {
    setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return stripBody ? stripRefreshToken(result) : result;
  }

  @Public()
  @Throttle(OTP_REQUEST_THROTTLE)
  @Post("otp/request")
  async requestOtp(@Body() dto: OtpRequestDto) {
    return this.authService.requestConsumerOtp(dto.phone);
  }

  @Public()
  @Throttle(OTP_VERIFY_THROTTLE)
  @Post("otp/verify")
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyConsumerOtp(
      dto.phone,
      dto.code,
    );
    return this.respond(res, result);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post("merchant/login")
  async merchantLogin(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.merchantLogin(
      dto.email,
      dto.password,
    );
    return this.respond(res, result);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post("admin/login")
  async adminLogin(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.adminLogin(dto.email, dto.password);
    return this.respond(res, result);
  }

  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Body() body: RefreshTokenBodyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromCookie: string | undefined = req.cookies?.[REFRESH_COOKIE];
    const token = fromCookie || body.refreshToken;
    if (!token) {
      throw new UnauthorizedException("Missing refresh token");
    }

    const result = await this.tokenService.refresh(token);
    // Cookie-mode caller (web panel) — the cookie already carries the new
    // token forward; don't also put it in the JSON body.
    return this.respond(res, result, !!fromCookie);
  }

  // @Public(): logout's whole job is "revoke the presented refresh token's
  // family" — it never reads the authenticated principal (req.user), only
  // the refresh token itself (cookie or body). Gating it behind a valid
  // BEARER ACCESS token as well would force a client whose access token
  // has already expired (a normal case — the access TTL is 15m, refresh is
  // 30d) to call /refresh first just to be ALLOWED to log out, which is
  // both pointless (that mints a token pair only to immediately destroy
  // it) and not meaningfully more secure: anyone holding a still-valid
  // refresh token could get a fresh access token via /refresh anyway.
  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post("logout")
  async logout(
    @Req() req: Request,
    @Body() body: RefreshTokenBodyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined =
      req.cookies?.[REFRESH_COOKIE] || body.refreshToken;
    if (token) {
      await this.tokenService.revokeFamilyByToken(token);
    }
    clearRefreshCookie(res);
    return { success: true };
  }
}
