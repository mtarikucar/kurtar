import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { TokenService } from "./services/token.service";
import { OtpRequestDto } from "./dto/otp-request.dto";
import { OtpVerifyDto } from "./dto/otp-verify.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenBodyDto } from "./dto/refresh-token.dto";
import { Public } from "./decorators/public.decorator";
import {
  AdminAuthResponseDto,
  AuthTokensDto,
  ConsumerAuthResponseDto,
  LogoutResponseDto,
  MerchantAuthResponseDto,
  OtpRequestResponseDto,
} from "./dto/auth-response.dto";
import { PrincipalType } from "@prisma/client";
import {
  clearRefreshCookie,
  readRefreshCookie,
  respondWithTokens,
  wantsCookieOnlyTransport,
} from "./refresh-cookie-transport.util";

// Per-route throttle tiers for the auth surface. All auth endpoints are
// either unauthenticated (@Public) or credential/OTP-bearing, so every one
// gets a tier tighter than the "default" 300/min global profile — mirrors
// kds's backend/src/modules/auth/auth.controller.ts LOGIN_THROTTLE /
// REFRESH_THROTTLE pattern.
const OTP_REQUEST_THROTTLE = { default: { limit: 3, ttl: 60_000 } };
const OTP_VERIFY_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const LOGIN_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const REFRESH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

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
 * before. The cookie/header/strip machinery itself now lives in
 * refresh-cookie-transport.util.ts — shared with merchants.controller.ts's
 * signup(), the second endpoint that mints a fresh session in a
 * browser-reachable response.
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @ApiOperation({
    summary: "Request a consumer OTP code by phone. No auth required.",
  })
  @ApiCreatedResponse({ type: OtpRequestResponseDto })
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
  @ApiCreatedResponse({ type: ConsumerAuthResponseDto })
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
    return respondWithTokens(
      res,
      "CONSUMER",
      result,
      wantsCookieOnlyTransport(req),
    );
  }

  @ApiOperation({ summary: "Merchant email/password login. No auth required." })
  @ApiCreatedResponse({ type: MerchantAuthResponseDto })
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
    return respondWithTokens(
      res,
      "MERCHANT",
      result,
      wantsCookieOnlyTransport(req),
    );
  }

  @ApiOperation({ summary: "Admin email/password login. No auth required." })
  @ApiCreatedResponse({ type: AdminAuthResponseDto })
  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post("admin/login")
  async adminLogin(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.adminLogin(dto.email, dto.password);
    return respondWithTokens(
      res,
      "ADMIN",
      result,
      wantsCookieOnlyTransport(req),
    );
  }

  // ---------------------------------------------------------------
  // Refresh + logout: ONE ROUTE PER ACTOR, not one shared route.
  //
  // There used to be a single `POST /auth/refresh` and a single `POST
  // /auth/logout`, both reading one unscoped `refreshToken` cookie. That
  // is the cross-actor session-bleed defect written up in full in
  // refresh-cookie-transport.util.ts: three actors sharing one cookie on
  // one origin means the last one to sign in owns the browser's only
  // session, and any surface's JS can trade that cookie for whatever
  // actor's access token happens to be behind it.
  //
  // Splitting the routes gives each actor's cookie a Path the browser
  // will only ever match for that actor (`/api/auth/admin/...`), so a
  // merchant page's refresh call does not even TRANSMIT the admin
  // cookie. TokenService then re-checks the stored token's
  // `principalType` against the actor argument below, so the guarantee
  // does not rest on cookie attributes alone.
  //
  // The three handlers are deliberately thin wrappers over one private
  // implementation each — the duplication is three decorator blocks, not
  // three copies of the logic.
  // ---------------------------------------------------------------

  @ApiOperation({
    summary:
      "Rotate a CONSUMER refresh token for a fresh token pair. No auth required (the refresh token IS the credential).",
  })
  @ApiCreatedResponse({ type: AuthTokensDto })
  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post("consumer/refresh")
  async refreshConsumer(
    @Req() req: Request,
    @Body() body: RefreshTokenBodyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.rotate("CONSUMER", req, body, res);
  }

  @ApiOperation({
    summary:
      "Rotate a MERCHANT refresh token for a fresh token pair. No auth required (the refresh token IS the credential).",
  })
  @ApiCreatedResponse({ type: AuthTokensDto })
  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post("merchant/refresh")
  async refreshMerchant(
    @Req() req: Request,
    @Body() body: RefreshTokenBodyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.rotate("MERCHANT", req, body, res);
  }

  @ApiOperation({
    summary:
      "Rotate an ADMIN refresh token for a fresh token pair. No auth required (the refresh token IS the credential).",
  })
  @ApiCreatedResponse({ type: AuthTokensDto })
  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post("admin/refresh")
  async refreshAdmin(
    @Req() req: Request,
    @Body() body: RefreshTokenBodyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.rotate("ADMIN", req, body, res);
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
      "Revoke a CONSUMER refresh token's whole family. No auth required (the refresh token IS the credential).",
  })
  @ApiCreatedResponse({ type: LogoutResponseDto })
  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post("consumer/logout")
  async logoutConsumer(
    @Req() req: Request,
    @Body() body: RefreshTokenBodyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.revoke("CONSUMER", req, body, res);
  }

  @ApiOperation({
    summary:
      "Revoke a MERCHANT refresh token's whole family. No auth required (the refresh token IS the credential).",
  })
  @ApiCreatedResponse({ type: LogoutResponseDto })
  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post("merchant/logout")
  async logoutMerchant(
    @Req() req: Request,
    @Body() body: RefreshTokenBodyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.revoke("MERCHANT", req, body, res);
  }

  @ApiOperation({
    summary:
      "Revoke an ADMIN refresh token's whole family. No auth required (the refresh token IS the credential).",
  })
  @ApiCreatedResponse({ type: LogoutResponseDto })
  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post("admin/logout")
  async logoutAdmin(
    @Req() req: Request,
    @Body() body: RefreshTokenBodyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.revoke("ADMIN", req, body, res);
  }

  private async rotate(
    actor: PrincipalType,
    req: Request,
    body: RefreshTokenBodyDto,
    res: Response,
  ) {
    const fromCookie = readRefreshCookie(req, actor);
    const token = fromCookie || body.refreshToken;
    if (!token) {
      throw new UnauthorizedException("Missing refresh token");
    }

    const result = await this.tokenService.refresh(token, actor);
    // Strip when the caller declared cookie transport OR actually
    // presented a cookie this call (the cookie already carries the new
    // token forward either way; repeating it in JS-readable JSON adds
    // exposure for no benefit — kds's stripRefreshToken pattern).
    return respondWithTokens(
      res,
      actor,
      result,
      wantsCookieOnlyTransport(req) || !!fromCookie,
    );
  }

  private async revoke(
    actor: PrincipalType,
    req: Request,
    body: RefreshTokenBodyDto,
    res: Response,
  ) {
    const token = readRefreshCookie(req, actor) || body.refreshToken;
    if (token) {
      await this.tokenService.revokeFamilyByToken(token, actor);
    }
    clearRefreshCookie(res, actor);
    return { success: true };
  }
}
