import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrincipalType } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

export interface JwtPayload {
  sub: string;
  actor: PrincipalType;
  merchantId?: string;
  role?: string;
}

/** The shape `@CurrentUser()` resolves to on every authenticated request. */
export interface AuthenticatedPrincipal {
  id: string;
  actor: PrincipalType;
  merchantId?: string;
  role?: string;
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
        select: { id: true, merchantId: true, role: true },
      });
      if (!merchantUser) {
        throw new UnauthorizedException("Account no longer exists");
      }
      return {
        id: merchantUser.id,
        actor: "MERCHANT",
        merchantId: merchantUser.merchantId,
        role: merchantUser.role,
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
