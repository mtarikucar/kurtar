import { Module } from "@nestjs/common";
import { ReservationsModule } from "../reservations/reservations.module";
import { PaymentSettleService } from "./payment-settle.service";
import { PaymentsSweeperService } from "./payments-sweeper.service";
import { PaymentsWebhookController } from "./payments-webhook.controller";

/**
 * Imports ReservationsModule for OfferStockService — the settle service's
 * failure branch and the sweeper release stock through the exact same
 * atomic primitive reservations.service.ts uses for cancel. PrismaService
 * and PaymentsFacadeService are both @Global (PrismaModule,
 * PaymentsCoreModule) so neither needs an explicit import here.
 */
@Module({
  imports: [ReservationsModule],
  controllers: [PaymentsWebhookController],
  providers: [PaymentSettleService, PaymentsSweeperService],
  exports: [PaymentSettleService],
})
export class PaymentsModule {}
