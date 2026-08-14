import { Module } from "@nestjs/common";
import { MembershipsModule } from "../memberships/memberships.module";
import { PricingModule } from "./pricing.module";
import { PublicHolidayService } from "./public-holiday.service";
import { SettlementBatchBuilderService } from "./settlement-batch-builder.service";
import { SettlementPayoutService } from "./settlement-payout.service";
import { SettlementsService } from "./settlements.service";
import { AdminSettlementsController } from "./admin-settlements.controller";
import { AdminPricingController } from "./admin-pricing.controller";
import { SettlementsController } from "./settlements.controller";

/**
 * SettlementSentEmailHandler (outbox/handlers/) and
 * SettlementSentInvoiceHandler (invoicing/) both consume the
 * settlement.batch.sent.v1 event this module's SettlementPayoutService
 * publishes — neither is declared here; both must be providers of
 * OutboxModule instead (see those handlers' own doc comments for why).
 */
@Module({
  imports: [MembershipsModule, PricingModule],
  controllers: [
    AdminSettlementsController,
    AdminPricingController,
    SettlementsController,
  ],
  providers: [
    PublicHolidayService,
    SettlementBatchBuilderService,
    SettlementPayoutService,
    SettlementsService,
  ],
  exports: [SettlementBatchBuilderService, SettlementPayoutService],
})
export class SettlementsModule {}
