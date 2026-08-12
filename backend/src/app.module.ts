import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { resolveEnvFilePath } from "./config/env-file";
import { validate } from "./config/env.validation";
import { THROTTLER_PROFILES } from "./common/config/throttler.config";
import { HealthModule } from "./modules/health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SmsModule } from "./modules/sms/sms.module";
import { OtpModule } from "./modules/otp/otp.module";
import { AuthModule } from "./modules/auth/auth.module";
import { PaymentsCoreModule } from "./modules/payments-core/payments-core.module";
import { ReservationsModule } from "./modules/reservations/reservations.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { MerchantsModule } from "./modules/merchants/merchants.module";
import { StoresModule } from "./modules/stores/stores.module";
import { OffersModule } from "./modules/offers/offers.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // The repo's .env.example (and any .env an operator creates from it)
      // lives at the repo root, but `npm run dev -w backend` runs with cwd
      // = backend/ — @nestjs/config's default cwd-relative lookup would
      // miss it. See config/env-file.ts for the full story.
      envFilePath: resolveEnvFilePath(),
      validate,
    }),
    // Registered globally so every `@Throttle({ default: { ... } })`
    // override (auth's OTP/login/refresh endpoints) has a live "default"
    // throttler to bind to — see common/config/throttler.config.ts.
    ThrottlerModule.forRoot(THROTTLER_PROFILES),
    // Powers @Cron in PaymentsSweeperService (Task 4).
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    SmsModule,
    OtpModule,
    AuthModule,
    PaymentsCoreModule,
    ReservationsModule,
    PaymentsModule,
    OffersModule,
    MerchantsModule,
    StoresModule,
  ],
  providers: [
    // Applies the matching THROTTLER_PROFILES tier to every route; auth
    // endpoints additionally narrow with per-route @Throttle() overrides.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
