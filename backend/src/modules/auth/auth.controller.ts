import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
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

/**
 * A web panel MUST declare cookie-only transport on every auth call
 * (login/verify/refresh) by sending `X-Client-Transport: cookie` — this is
 * what lets the server strip the refresh token out of the JSON response
 * body on the calls that matter most: the INITIAL login/verify issuance,
 * not just later /refresh rotations. (A review caught that returning the
 * fresh 30-day refresh token in JS-readable JSON on every login response —
 * regardless of transport — defeated the httpOnly cookie's XSS protection
 * for exactly the token it exists to protect.) Callers that omit the
 * header (the RN mobile app, which has no meaningful cookie jar and reads
 * the token from SecureStore instead) get the token in the body, as
 * before.
 */
const CLIENT_TRANSPORT_HEADER = "x-client-transport";
const COOKIE_TRANSPORT_VALUE = "cookie";

function wantsCookieOnlyTransport(req: Request): boolean {
  const value = req.header(CLIENT_TRANSPORT_HEADER);
  return (
    typeof value === "string" && value.toLowerCase() === COOKIE_TRANSPORT_VALUE
  );
}

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

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Sets the refresh cookie on every response (harmless for callers that
   * ignore it) and returns the raw refresh token in the JSON body UNLESS
   * `stripBody` is set. Every call site below computes `stripBody` from
   * `wantsCookieOnlyTransport(req)` — i.e. the caller's OWN declared
   * transport, checked on every issuing endpoint (login/verify AND
   * refresh), not inferred after the fact from whether a cookie happened
   * to be presented. `/refresh` additionally ORs in "a cookie was actually
   * presented this call" as a defense-in-depth fallback for a web client
   * that, for whatever reason, didn't send the header on a later refresh.
   */
  private respond<T extends IssuedTokens>(
    res: Response,
    result: T,
    stripBody: boolean,
  ) {
    setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return stripBody ? stripRefreshToken(result) : result;
  }

  @ApiOperation({
    summary: "Request a consumer OTP code by phone. No auth required.",
  })
  @Public()
  @Throttle(OTP_REQUEST_THROTTLE)
  @Post("otp/request")
  async requestOtp(@Body() dto: OtpRequestDto) {
    return this.authService.requestConsumerOtp(dto.phone);
  }

  @ApiOperation({
    summary:
      "Verify a consumer OTP code and issue a token pair. No auth required.",
  })
  @Public()
  @Throttle(OTP_VERIFY_THROTTLE)
  @Post("otp/verify")
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyConsumerOtp(
      dto.phone,
      dto.code,
    );
    return this.respond(res, result, wantsCookieOnlyTransport(req));
  }

  @ApiOperation({ summary: "Merchant email/password login. No auth required." })
  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post("merchant/login")
  async merchantLogin(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.merchantLogin(
      dto.email,
      dto.password,
    );
    return this.respond(res, result, wantsCookieOnlyTransport(req));
  }

  @ApiOperation({ summary: "Admin email/password login. No auth required." })
  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post("admin/login")
  async adminLogin(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.adminLogin(dto.email, dto.password);
    return this.respond(res, result, wantsCookieOnlyTransport(req));
  }

  @ApiOperation({
    summary:
      "Rotate a refresh token for a fresh token pair. No auth required (the refresh token IS the credential).",
  })
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
    // Strip when the caller declared cookie transport OR actually
    // presented a cookie this call (the cookie already carries the new
    // token forward either way; repeating it in JS-readable JSON adds
    // exposure for no benefit — kds's stripRefreshToken pattern).
    return this.respond(
      res,
      result,
      wantsCookieOnlyTransport(req) || !!fromCookie,
    );
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
  @ApiOperation({
    summary:
      "Revoke a refresh token's whole family. No auth required (the refresh token IS the credential).",
  })
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
