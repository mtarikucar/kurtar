import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MerchantVerificationStatus, PrincipalType } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

export interface JwtPayload {
  sub: string;
  actor: PrincipalType;
  merchantId?: string;
  role?: string;
}

/**
 * The shape `@CurrentUser()` resolves to on every authenticated request.
 *
 * `merchantVerificationStatus` is populated fresh on EVERY request (this
 * strategy already re-reads the MerchantUser row per request; the review
 * that added this field piggybacks on that same read rather than adding a
 * second query) — never baked into the signed JWT itself, so a merchant
 * suspended mid-session is blocked on their very next request, not only
 * after their 15-minute access token expires. MerchantApprovalGuard
 * (../guards/merchant-approval.guard.ts) is what actually enforces it.
 */
export interface AuthenticatedPrincipal {
  id: string;
  actor: PrincipalType;
  merchantId?: string;
  role?: string;
  merchantVerificationStatus?: MerchantVerificationStatus;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    // Fail fast at boot: JWT_SECRET is the entire security boundary for
    // every authenticated route. Nest instantiates providers during
    // application bootstrap, so throwing here refuses to boot rather than
    // starting up and rejecting the first authenticated request with a
    // confusing 500. Mirrors kds's
    // backend/src/modules/auth/strategies/jwt.strategy.ts exactly (this
    // check is unconditional — unlike DATABASE_URL/REDIS_URL in
    // config/env.validation.ts, there is no "acceptable to run without
    // this in dev" story for the JWT secret).
    const secret = configService.get<string>("JWT_SECRET");
    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ["HS256"],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedPrincipal> {
    if (payload.actor === "CONSUMER") {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true },
      });
      if (!user || user.status !== "ACTIVE") {
        throw new UnauthorizedException("Account is not active");
      }
      return { id: user.id, actor: "CONSUMER" };
    }

    if (payload.actor === "MERCHANT") {
      const merchantUser = await this.prisma.merchantUser.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          merchantId: true,
          role: true,
          merchant: { select: { verificationStatus: true } },
        },
      });
      if (!merchantUser) {
        throw new UnauthorizedException("Account no longer exists");
      }
      return {
        id: merchantUser.id,
        actor: "MERCHANT",
        merchantId: merchantUser.merchantId,
        role: merchantUser.role,
        merchantVerificationStatus: merchantUser.merchant.verificationStatus,
      };
    }

    if (payload.actor === "ADMIN") {
      const adminUser = await this.prisma.adminUser.findUnique({
        where: { id: payload.sub },
        select: { id: true, active: true },
      });
      if (!adminUser || !adminUser.active) {
        throw new UnauthorizedException("Account is not active");
      }
      return { id: adminUser.id, actor: "ADMIN" };
    }

    throw new UnauthorizedException("Invalid token actor");
  }
}
