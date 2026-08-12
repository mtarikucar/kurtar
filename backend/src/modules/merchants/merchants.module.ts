import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OffersModule } from "../offers/offers.module";
import { MerchantsController } from "./merchants.controller";
import { AdminMerchantsController } from "./admin-merchants.controller";
import { MerchantsService } from "./merchants.service";

/**
 * AuthModule is imported for TokenService (signup mints tokens directly,
 * bypassing the password-login flow — it already holds the freshly
 * created MerchantUser). OffersModule is imported for OffersService,
 * which the suspend kill-switch calls into ("via the offers service" per
 * the brief) rather than reaching into ReservationsService directly.
 */
@Module({
  imports: [AuthModule, OffersModule],
  controllers: [MerchantsController, AdminMerchantsController],
  providers: [MerchantsService],
})
export class MerchantsModule {}
