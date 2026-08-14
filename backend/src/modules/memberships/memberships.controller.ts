import { Controller, Get } from "@nestjs/common";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { MembershipsService } from "./memberships.service";

@Controller("merchants/me/membership")
@Actors("MERCHANT")
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  getMine(@CurrentUser("merchantId") merchantId: string) {
    return this.memberships.getMine(merchantId);
  }
}
