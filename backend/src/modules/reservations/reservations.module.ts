import { Module } from "@nestjs/common";
import { ReservationsController } from "./reservations.controller";
import { ReservationsService } from "./reservations.service";
import { OfferStockService } from "./offer-stock.service";

/**
 * PrismaService (PrismaModule) and PaymentsFacadeService
 * (PaymentsCoreModule) are both @Global, so neither needs an explicit
 * import here. OfferStockService is exported — payments' settle service
 * and sweeper (webhook/sweeper-triggered expiry) release stock through
 * the exact same atomic primitive reservations.service.ts uses for cancel.
 * [Task 5] ReservationsService is now also exported — modules/offers
 * (merchant cancel) and modules/merchants (suspend kill-switch) both
 * inject it to reuse cancelAllForOffer/refundMany rather than duplicating
 * stock/refund logic.
 */
@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService, OfferStockService],
  exports: [OfferStockService, ReservationsService],
})
export class ReservationsModule {}
