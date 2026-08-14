import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { OtpService, OtpRequestResult } from "../otp/otp.service";
import { IssuedTokens, TokenService } from "./services/token.service";

// Dummy bcrypt hash used to normalize response time between "account not
// found" and "wrong password" — bcrypt.compare against this hash costs the
// same work factor as a real check, so an attacker can't use timing to
// enumerate which emails have accounts. Ported from kds's
// backend/src/modules/auth/services/password.service.ts. Computed once at
// module load with cost 12 (bcryptjs default).
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(
  "dummy-password-for-timing-normalization",
  12,
);

export interface AuthResult extends IssuedTokens {
  user: Record<string, unknown>;
}

/**
 * Orchestrates the three actor login flows on top of OtpService (consumer)
 * and TokenService (all three). Credential comparison for MERCHANT/ADMIN
 * lives here rather than in a separate PasswordService (unlike kds) — this
 * task's brief has no forgot/reset/change-password surface, so a full
 * PasswordService port would carry unused methods; bcrypt compare is two
 * call sites and stays inline.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
  ) {}

  requestConsumerOtp(phoneE164: string): Promise<OtpRequestResult> {
    return this.otpService.requestOtp(phoneE164);
  }

  /**
   * Verify a consumer's OTP, upsert their User row by phone (setting
   * phoneVerifiedAt on every successful verify, matching the brief), and
   * issue tokens. BANNED/DELETED users are refused with an explicit error
   * code — they never reach token issuance.
   */
  async verifyConsumerOtp(
    phoneE164: string,
    code: string,
  ): Promise<AuthResult> {
    await this.otpService.verifyOtp(phoneE164, code);

    const existing = await this.prisma.user.findUnique({
      where: { phoneE164 },
    });

    if (existing && existing.status !== "ACTIVE") {
      throw new ForbiddenException({
        statusCode: 403,
        errorCode:
          existing.status === "BANNED" ? "ACCOUNT_BANNED" : "ACCOUNT_DELETED",
        message: "This account cannot sign in.",
      });
    }

    const now = new Date();
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: { phoneVerifiedAt: now },
        })
      : await this.prisma.user.create({
          data: { phoneE164, phoneVerifiedAt: now },
        });

    const tokens = await this.tokenService.issueTokens({
      id: user.id,
      actor: "CONSUMER",
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phoneE164,
        status: user.status,
        name: user.name,
      },
    };
  }

  async merchantLogin(email: string, password: string): Promise<AuthResult> {
    const merchantUser = await this.prisma.merchantUser.findUnique({
      where: { email },
    });

    const valid = await bcrypt.compare(
      password,
      merchantUser?.passwordHash ?? DUMMY_BCRYPT_HASH,
    );
    if (!merchantUser || !valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.prisma.merchantUser.update({
      where: { id: merchantUser.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.tokenService.issueTokens({
      id: merchantUser.id,
      actor: "MERCHANT",
      merchantId: merchantUser.merchantId,
      role: merchantUser.role,
    });

    return {
      ...tokens,
      user: {
        id: merchantUser.id,
        email: merchantUser.email,
        role: merchantUser.role,
        merchantId: merchantUser.merchantId,
      },
    };
  }

  async adminLogin(email: string, password: string): Promise<AuthResult> {
    const adminUser = await this.prisma.adminUser.findUnique({
      where: { email },
    });

    const valid = await bcrypt.compare(
      password,
      adminUser?.passwordHash ?? DUMMY_BCRYPT_HASH,
    );
    if (!adminUser || !adminUser.active || !valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const tokens = await this.tokenService.issueTokens({
      id: adminUser.id,
      actor: "ADMIN",
    });

    return {
      ...tokens,
      user: { id: adminUser.id, email: adminUser.email, name: adminUser.name },
    };
  }
}
