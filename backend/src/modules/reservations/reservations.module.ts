import { Module } from "@nestjs/common";
import { PushModule } from "../notifications/push/push.module";
import { ReservationsController } from "./reservations.controller";
import { ReservationsService } from "./reservations.service";
import { OfferStockService } from "./offer-stock.service";
import { PickupReminderCronService } from "./pickup-reminder-cron.service";
import { NoShowSweeperService } from "./no-show-sweeper.service";

/**
 * PrismaService (PrismaModule), PaymentsFacadeService (PaymentsCoreModule)
 * and OutboxService (OutboxCoreModule) are all @Global, so none needs an
 * explicit import here. PushModule IS imported explicitly — it isn't
 * global — for PickupReminderCronService's PushDispatchService dependency.
 * OfferStockService is exported — payments' settle service and sweeper
 * (webhook/sweeper-triggered expiry) release stock through the exact same
 * atomic primitive reservations.service.ts uses for cancel.
 * [Task 5] ReservationsService is now also exported — modules/offers
 * (merchant cancel) and modules/merchants (suspend kill-switch) both
 * inject it to reuse cancelAllForOffer/refundMany rather than duplicating
 * stock/refund logic.
 */
@Module({
  imports: [PushModule],
  controllers: [ReservationsController],
  providers: [
    ReservationsService,
    OfferStockService,
    PickupReminderCronService,
    NoShowSweeperService,
  ],
  exports: [OfferStockService, ReservationsService],
})
export class ReservationsModule {}
