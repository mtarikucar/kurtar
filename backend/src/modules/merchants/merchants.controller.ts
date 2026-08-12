import { Body, Controller, Get, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/decorators/public.decorator";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { MerchantSignupDto } from "./dto/merchant-signup.dto";
import { MerchantSubmitDto } from "./dto/merchant-submit.dto";
import { MerchantsService } from "./merchants.service";

// Account-creation surface — same tier as auth's LOGIN_THROTTLE
// (auth.controller.ts), tighter than the global default profile.
const SIGNUP_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller("merchants")
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Public()
  @Throttle(SIGNUP_THROTTLE)
  @Post("signup")
  signup(@Body() dto: MerchantSignupDto) {
    return this.merchants.signup(dto);
  }

  @Actors("MERCHANT")
  @Post("me/submit")
  submit(
    @CurrentUser("merchantId") merchantId: string,
    @Body() dto: MerchantSubmitDto,
  ) {
    return this.merchants.submit(merchantId, dto);
  }

  @Actors("MERCHANT")
  @Get("me")
  getMe(@CurrentUser("merchantId") merchantId: string) {
    return this.merchants.getMe(merchantId);
  }
}
