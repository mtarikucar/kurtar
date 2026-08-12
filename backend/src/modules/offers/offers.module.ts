import { Module } from "@nestjs/common";
import { ReservationsModule } from "../reservations/reservations.module";
import { BagTemplatesController } from "./bag-templates.controller";
import { BagTemplatesService } from "./bag-templates.service";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";
import { OffersPublishSchedulerService } from "./offers-publish-scheduler.service";

/**
 * ReservationsModule is imported for ReservationsService — OffersService's
 * cancel path calls cancelAllForOffer/refundMany on it (never duplicates
 * that logic). OffersService is exported so modules/merchants can inject
 * it for the suspend kill-switch (cancelAllActiveForMerchant), matching
 * the brief's "suspend CANCELS all the merchant's active offers via the
 * offers service".
 */
@Module({
  imports: [ReservationsModule],
  controllers: [BagTemplatesController, OffersController],
  providers: [
    BagTemplatesService,
    OffersService,
    OffersPublishSchedulerService,
  ],
  exports: [OffersService],
})
export class OffersModule {}
