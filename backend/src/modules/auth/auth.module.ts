import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { OtpModule } from "../otp/otp.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./services/token.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { ActorsGuard } from "./guards/actors.guard";

@Module({
  imports: [
    OtpModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN") || "15m",
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtStrategy,
    // Global auth pipeline: every route requires a valid access token
    // unless annotated @Public(); ActorsGuard then narrows by @Actors().
    // Registration order matters — Nest runs APP_GUARDs in the order
    // they're provided, and ActorsGuard reads req.user, which JwtAuthGuard
    // (via Passport) is what populates.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ActorsGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
