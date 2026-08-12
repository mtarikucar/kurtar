import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SmsService } from "../sms/sms.service";
import { maskPhone } from "../../common/helpers/pii-mask.helper";
import { constantTimeEquals, generateOtp, hashOtp } from "./otp.helpers";

export const OTP_CODE_TTL_MS = 10 * 60_000; // 10 minutes
export const OTP_RESEND_COOLDOWN_MS = 60_000; // 60 seconds
export const OTP_MAX_ATTEMPTS = 3; // per code
export const OTP_FAILED_CODE_LOCKOUT_THRESHOLD = 5; // burned codes in window
export const OTP_FAILURE_WINDOW_MS = 24 * 60 * 60_000; // 24h
export const OTP_LOCKOUT_DURATION_MS = 24 * 60 * 60_000; // 24h

export interface OtpRequestResult {
  expiresAt: Date;
  /** Only populated when SmsService is running the mock provider (dev). */
  devCode?: string;
}

/**
 * Uniform failure for every verify() rejection branch — phone locked, no
 * active code (never requested / expired / already consumed), attempts
 * already exhausted, or a plain wrong code. Deliberately the SAME
 * exception type and message in every case so a caller cannot use the
 * response to distinguish one failure mode from another (no oracle: an
 * attacker guessing codes learns nothing beyond "that attempt failed").
 */
export class OtpVerificationFailedException extends UnauthorizedException {
  constructor() {
    super("Invalid or expired verification code");
  }
}

/**
 * OtpService — OTP lifecycle on the PhoneOtp model. Hardening semantics
 * ported from kds's backend/src/modules/customers/phone-verification.service.ts
 * (hashed code, TTL, resend cooldown, attempt cap, failure lockout, atomic
 * attempt increment), adapted to kurtar's PhoneOtp schema (no tenant/session
 * scoping — kurtar has no tenants — and a single `lockedUntil` column per
 * row instead of kds's per-tenant daily-cap counters) and to the brief's
 * explicit "verify() failures must be uniform, no oracle" requirement,
 * which kds's own verifyOTP does NOT satisfy (it returns an
 * attempts-remaining count and a distinct "no active verification" vs
 * "invalid code" message — both are oracles this port deliberately closes).
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  /**
   * Request a new OTP code for a phone number. Invalidates any still-active
   * prior code (only the newest code is ever verifiable), then creates and
   * sends a fresh one.
   */
  async requestOtp(phoneE164: string): Promise<OtpRequestResult> {
    const now = new Date();
    const masked = maskPhone(phoneE164);

    const latest = await this.prisma.phoneOtp.findFirst({
      where: { phoneE164 },
      orderBy: { createdAt: "desc" },
    });

    if (latest?.lockedUntil && latest.lockedUntil > now) {
      throw new BadRequestException(
        "Too many failed verification attempts on this phone. Please try again later.",
      );
    }

    if (
      latest &&
      now.getTime() - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      throw new BadRequestException(
        "Please wait before requesting another code.",
      );
    }

    // Invalidate any still-active prior code — expire it rather than
    // stamping consumedAt, which is reserved for a SUCCESSFUL verify.
    await this.prisma.phoneOtp.updateMany({
      where: { phoneE164, consumedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });

    const code = generateOtp();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(now.getTime() + OTP_CODE_TTL_MS);

    await this.prisma.phoneOtp.create({
      data: { phoneE164, codeHash, expiresAt },
    });

    const message = `kurtar dogrulama kodunuz: ${code}`;
    const sent = await this.smsService.sendVerificationCode(phoneE164, message);
    if (!sent && !this.smsService.isMockMode()) {
      this.logger.warn(`OTP SMS delivery failed for ${masked}`);
    }

    const devCode = this.smsService.isMockMode() ? code : undefined;
    if (devCode) {
      this.logger.debug(`OTP for ${masked}: ${devCode} (dev only)`);
    }

    return { expiresAt, ...(devCode ? { devCode } : {}) };
  }

  /**
   * Verify a submitted code. The attempt increment is atomic (a single
   * conditional updateMany gated on `attemptCount < max`) so two parallel
   * wrong guesses against the same code cannot under-count attempts — see
   * otp-attempt-increment.realdb.spec.ts.
   */
  async verifyOtp(
    phoneE164: string,
    code: string,
  ): Promise<{ verified: true }> {
    const now = new Date();

    await this.assertNotLocked(phoneE164, now);

    const active = await this.prisma.phoneOtp.findFirst({
      where: { phoneE164, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });

    if (!active) {
      throw new OtpVerificationFailedException();
    }

    const claimed = await this.prisma.phoneOtp.updateMany({
      where: {
        id: active.id,
        attemptCount: { lt: OTP_MAX_ATTEMPTS },
        consumedAt: null,
      },
      data: { attemptCount: { increment: 1 } },
    });

    if (claimed.count === 0) {
      // Attempts already exhausted (possibly by a concurrent verify that
      // won the race on the last slot).
      await this.maybeTriggerLockout(phoneE164, now);
      throw new OtpVerificationFailedException();
    }

    const match = constantTimeEquals(hashOtp(code), active.codeHash);
    if (!match) {
      await this.maybeTriggerLockout(phoneE164, now);
      throw new OtpVerificationFailedException();
    }

    await this.prisma.phoneOtp.updateMany({
      where: { id: active.id, consumedAt: null },
      data: { consumedAt: now },
    });

    return { verified: true };
  }

  private async assertNotLocked(phoneE164: string, now: Date): Promise<void> {
    const latest = await this.prisma.phoneOtp.findFirst({
      where: { phoneE164 },
      orderBy: { createdAt: "desc" },
    });
    if (latest?.lockedUntil && latest.lockedUntil > now) {
      throw new OtpVerificationFailedException();
    }
  }

  /**
   * After a failed verify, count how many DISTINCT codes for this phone
   * were fully burned (attemptCount reached the max without ever being
   * consumed) inside the failure window. Once the count reaches the
   * threshold, lock the phone for OTP_LOCKOUT_DURATION_MS by stamping
   * `lockedUntil` on the most-recent-by-createdAt row for the phone —
   * assertNotLocked() always reads that same row, and no new row can be
   * created while locked (requestOtp checks the same lock first), so it
   * stays the authoritative "current state" row for as long as the lock
   * is active. This only ever runs on calls that got past
   * assertNotLocked(), i.e. while NOT yet locked, so it cannot re-extend
   * an already-active lock into a rolling one.
   */
  private async maybeTriggerLockout(
    phoneE164: string,
    now: Date,
  ): Promise<void> {
    const windowStart = new Date(now.getTime() - OTP_FAILURE_WINDOW_MS);
    const burnedCount = await this.prisma.phoneOtp.count({
      where: {
        phoneE164,
        consumedAt: null,
        attemptCount: { gte: OTP_MAX_ATTEMPTS },
        createdAt: { gte: windowStart },
      },
    });

    if (burnedCount < OTP_FAILED_CODE_LOCKOUT_THRESHOLD) return;

    const latest = await this.prisma.phoneOtp.findFirst({
      where: { phoneE164 },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) return;

    const lockedUntil = new Date(now.getTime() + OTP_LOCKOUT_DURATION_MS);
    await this.prisma.phoneOtp.update({
      where: { id: latest.id },
      data: { lockedUntil },
    });

    this.logger.warn(
      `OTP failure lockout triggered for ${maskPhone(phoneE164)} (${burnedCount} burned codes in ${
        OTP_FAILURE_WINDOW_MS / 3_600_000
      }h)`,
    );
  }
}
