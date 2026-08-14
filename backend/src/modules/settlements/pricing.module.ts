import { Module } from "@nestjs/common";
import { PricingService } from "./pricing.service";

/**
 * Split out from SettlementsModule specifically so MembershipsModule can
 * depend on PricingService (it needs price-as-of-date to compute a fresh
 * subscription/renewal price) WITHOUT importing SettlementsModule itself
 * — SettlementsModule already imports MembershipsModule (for
 * MembershipOffsetService), so the reverse import would be a circular
 * module dependency. Both SettlementsModule and MembershipsModule import
 * THIS small module instead; neither imports the other for pricing.
 */
@Module({
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
