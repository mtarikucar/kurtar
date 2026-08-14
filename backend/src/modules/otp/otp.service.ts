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
 * scoping — kurtar has no tenants) and to the brief's explicit "verify()
 * failures must be uniform, no oracle" requirement, which kds's own
 * verifyOTP does NOT satisfy (it returns an attempts-remaining count and a
 * distinct "no active verification" vs "invalid code" message — both are
 * oracles this port deliberately closes).
 *
 * SECURITY NOTE — the OTP code is NEVER returned by any public method here
 * or by any HTTP response derived from them. The only place the raw code
 * is ever visible outside the DB (as a SHA-256 hash) is a `Logger.debug`
 * line, gated on the mock SMS provider being active — and SmsService
 * itself refuses to boot with the mock provider in production, so that
 * log line can never fire there. A prior version of this file also echoed
 * the code back in `requestOtp`'s HTTP response body whenever the mock
 * provider was active; that was a public, unauthenticated
 * account-takeover primitive (an operator whose NODE_ENV was merely unset
 * or misspelled — previously silently treated as "development" — would
 * have shipped an API that handed out any phone's OTP to anyone who asked
 * for it) and has been removed. Local/dev testing reads the code from the
 * server log line instead (`docker compose logs` / stdout), exactly like
 * kds's own dev-mode echo.
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

    if (await this.isLocked(phoneE164, now)) {
      throw new BadRequestException(
        "Too many failed verification attempts on this phone. Please try again later.",
      );
    }

    const latest = await this.prisma.phoneOtp.findFirst({
      where: { phoneE164 },
      orderBy: { createdAt: "desc" },
    });

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

    // Dev-only echo, log line ONLY — never part of the HTTP response. See
    // the class doc for why. Unreachable in production: SmsService refuses
    // to boot with the mock provider there, so isMockMode() can never be
    // true in a production process.
    if (this.smsService.isMockMode()) {
      this.logger.debug(`OTP for ${masked}: ${code} (dev only)`);
    }

    return { expiresAt };
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

    if (await this.isLocked(phoneE164, now)) {
      throw new OtpVerificationFailedException();
    }

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

  /**
   * Is this phone currently locked out? Race-free by construction against
   * the bug a review caught in the original implementation: that version
   * checked ONLY the newest-by-createdAt row's `lockedUntil` — but a
   * concurrent requestOtp() can insert a brand-new row (lockedUntil: null)
   * that becomes the new "newest" row, silently erasing an active lock
   * (a 15-guess/day budget could balloon to ~4,300/day). This version
   * never depends on which row is newest:
   *
   *  1. Fast path — scan ALL of the phone's rows (not just the latest)
   *     for any still-unexpired `lockedUntil`. A fresh unlocked row
   *     inserted by a racing requestOtp() cannot make an older row's
   *     still-future `lockedUntil` disappear.
   *  2. Fallback — recompute the burned-code count fresh (kds's
   *     assertNotInFailureLockout pattern: never trust only a persisted
   *     flag) so a threshold-crossing burst is caught even if no single
   *     call's write "stuck". Anchored via windowAnchor() — see there for
   *     why a plain rolling 24h window would otherwise re-lock a user on
   *     their very first retry after a previous lock's expiry.
   */
  private async isLocked(phoneE164: string, now: Date): Promise<boolean> {
    const activeLock = await this.prisma.phoneOtp.findFirst({
      where: { phoneE164, lockedUntil: { gt: now } },
      select: { id: true },
    });
    if (activeLock) return true;

    const windowStart = await this.windowAnchor(phoneE164, now);
    const burnedCount = await this.prisma.phoneOtp.count({
      where: {
        phoneE164,
        consumedAt: null,
        attemptCount: { gte: OTP_MAX_ATTEMPTS },
        createdAt: { gte: windowStart },
      },
    });
    return burnedCount >= OTP_FAILED_CODE_LOCKOUT_THRESHOLD;
  }

  /**
   * Anchors the burned-code counting window. Normally a plain rolling
   * OTP_FAILURE_WINDOW_MS (24h) lookback. But once a lock has been served
   * and expired, the codes that TRIGGERED that lock are still sitting
   * inside a naive rolling 24h window for up to another 24h — so a
   * legitimate user's very first retry after their lock expires would
   * immediately push the count back over the threshold and re-lock them,
   * indefinitely, as long as they keep retrying roughly once a day. To
   * avoid that, once the most recent lock has expired, the window starts
   * at that lock's expiry instead of `now - 24h` — codes that already
   * contributed to a served-out lockout never count toward triggering a
   * new one.
   */
  private async windowAnchor(phoneE164: string, now: Date): Promise<Date> {
    const rollingWindowStart = new Date(now.getTime() - OTP_FAILURE_WINDOW_MS);

    const lastExpiredLock = await this.prisma.phoneOtp.findFirst({
      where: { phoneE164, lockedUntil: { not: null, lte: now } },
      orderBy: { lockedUntil: "desc" },
      select: { lockedUntil: true },
    });

    if (
      lastExpiredLock?.lockedUntil &&
      lastExpiredLock.lockedUntil > rollingWindowStart
    ) {
      return lastExpiredLock.lockedUntil;
    }
    return rollingWindowStart;
  }

  /**
   * After a failed verify, recompute the burned-code count (same query
   * `isLocked` uses) and, once it reaches the threshold, persist
   * `lockedUntil` on the phone's most-recent row — purely as an
   * observability/audit record (support tooling, "why is this phone
   * locked") and as the `isLocked()` fast path's data source. The GATING
   * decision itself never depends solely on this write having happened or
   * "stuck" — `isLocked()` always recomputes the count independently too.
   */
  private async maybeTriggerLockout(
    phoneE164: string,
    now: Date,
  ): Promise<void> {
    const windowStart = await this.windowAnchor(phoneE164, now);
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
      `OTP failure lockout triggered for ${maskPhone(phoneE164)} (${burnedCount} burned codes in window)`,
    );
  }
}
