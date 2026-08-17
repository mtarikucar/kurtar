import { Module } from "@nestjs/common";
import { PricingModule } from "../settlements/pricing.module";
import { MembershipsService } from "./memberships.service";
import { MembershipOffsetService } from "./membership-offset.service";
import { MembershipRenewalCronService } from "./membership-renewal-cron.service";
import { MembershipsController } from "./memberships.controller";

/**
 * MembershipApprovedHandler is deliberately NOT declared here — it must be
 * a provider of OutboxModule to reach OutboxHandlerRegistry (that
 * registry is not exported for other modules to inject; see
 * OutboxHandlerRegistry's own doc comment), so it is imported and
 * registered there instead, even though its class file lives under this
 * folder. This module exports MembershipsService (which that handler
 * needs) and MembershipOffsetService (which SettlementsModule needs) for
 * exactly that cross-module wiring.
 */
@Module({
  imports: [PricingModule],
  controllers: [MembershipsController],
  providers: [
    MembershipsService,
    MembershipOffsetService,
    MembershipRenewalCronService,
  ],
  exports: [MembershipsService, MembershipOffsetService],
})
export class MembershipsModule {}
