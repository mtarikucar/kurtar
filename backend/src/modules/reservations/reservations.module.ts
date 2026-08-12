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
 */
@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService, OfferStockService],
  exports: [OfferStockService],
})
export class ReservationsModule {}
