import { Body, Controller, Get, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
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

  @ApiOperation({
    summary: "Create a merchant account (DRAFT). No auth required.",
  })
  @ApiCreatedResponse({ type: MerchantSignupResponseDto })
  @Public()
  @Throttle(SIGNUP_THROTTLE)
  @Post("signup")
  signup(@Body() dto: MerchantSignupDto) {
    return this.merchants.signup(dto);
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
