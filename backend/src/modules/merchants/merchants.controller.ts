import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import {
  respondWithTokens,
  wantsCookieOnlyTransport,
} from "../auth/refresh-cookie-transport.util";
import { MerchantSignupDto } from "./dto/merchant-signup.dto";
import { MerchantSubmitDto } from "./dto/merchant-submit.dto";
import { MerchantsService } from "./merchants.service";
import {
  MerchantMeResponseDto,
  MerchantSignupResponseDto,
  MerchantSubmitResponseDto,
} from "./dto/merchant-response.dto";

// Account-creation surface — same tier as auth's LOGIN_THROTTLE
// (auth.controller.ts), tighter than the global default profile.
const SIGNUP_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags("merchants")
@Controller("merchants")
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  // [Security fix] Merchant signup mints a full session (a token pair) in
  // a browser-reachable response — merchant-web's own registration
  // screen — but this endpoint was added after Task 3's
  // X-Client-Transport: cookie convention and never adopted it: it used
  // to return `this.merchants.signup(dto)` directly, which always
  // includes the 30-day refresh token in JS-readable JSON regardless of
  // transport and never sets the httpOnly cookie at all. Same class of
  // bug the review originally caught and fixed on /auth/otp/verify and
  // /auth/*/login. Now routes through the SAME shared
  // respondWithTokens()/wantsCookieOnlyTransport() used by
  // AuthController — same header, same cookie attributes, same
  // stripping, same precedence — not a second, divergent implementation.
  @ApiOperation({
    summary: "Create a merchant account (DRAFT). No auth required.",
  })
  @ApiCreatedResponse({ type: MerchantSignupResponseDto })
  @Public()
  @Throttle(SIGNUP_THROTTLE)
  @Post("signup")
  async signup(
    @Body() dto: MerchantSignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.merchants.signup(dto);
    // "MERCHANT": signup mints a MERCHANT session, so its refresh cookie
    // is the merchant-scoped one (name + path) even though this route
    // lives outside /api/auth — see refresh-cookie-transport.util.ts's
    // ACTOR SCOPING note on why Path follows the actor, not the route.
    return respondWithTokens(
      res,
      "MERCHANT",
      result,
      wantsCookieOnlyTransport(req),
    );
  }

  // Must keep working for exactly the statuses MerchantApprovalGuard would
  // otherwise block (DRAFT before the first submit; SUBMITTED/UNDER_REVIEW
  // while waiting; REJECTED/SUSPENDED so the merchant can see why) — a
  // merchant account's whole verification journey happens through this
  // endpoint before it can ever reach APPROVED.
  @ApiOperation({ summary: "Submit the merchant account for KYC review." })
  @ApiCreatedResponse({ type: MerchantSubmitResponseDto })
  @ApiBearerAuth()
  @ApiStandardErrors()
  @Actors("MERCHANT")
  @AllowUnapprovedMerchant()
  @Post("me/submit")
  submit(
    @CurrentUser("merchantId") merchantId: string,
    @Body() dto: MerchantSubmitDto,
  ) {
    return this.merchants.submit(merchantId, dto);
  }

  // Always allowed regardless of status — a merchant must be able to see
  // their own verificationStatus (including SUSPENDED/REJECTED) to know
  // what's happening to their account.
  @ApiOperation({
    summary: "Get the calling merchant's own account/verification status.",
  })
  @ApiOkResponse({ type: MerchantMeResponseDto })
  @ApiBearerAuth()
  @ApiStandardErrors()
  @Actors("MERCHANT")
  @AllowUnapprovedMerchant()
  @Get("me")
  getMe(@CurrentUser("merchantId") merchantId: string) {
    return this.merchants.getMe(merchantId);
  }
}
