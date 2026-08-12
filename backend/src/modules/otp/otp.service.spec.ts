import { BadRequestException, Logger } from "@nestjs/common";
import {
  OTP_FAILED_CODE_LOCKOUT_THRESHOLD,
  OTP_MAX_ATTEMPTS,
  OtpService,
  OtpVerificationFailedException,
} from "./otp.service";
import { hashOtp } from "./otp.helpers";

// OtpService logs the dev-only code echo (debug) and lockout events (warn)
// — both expected, not failures. Silence them so `npm test` output stays
// readable; assertions below don't depend on log content.
beforeEach(() => {
  jest.spyOn(Logger.prototype, "debug").mockImplementation();
  jest.spyOn(Logger.prototype, "warn").mockImplementation();
});
afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Routing mock for phoneOtp.findFirst — OtpService now issues several
 * structurally-different findFirst calls per method (isLocked's
 * any-row active-lock scan, windowAnchor's most-recently-expired-lock
 * lookup, the cooldown/active-code lookup), so a plain sequential
 * mockResolvedValueOnce chain would be both fragile (breaks the instant
 * call order changes) and unreadable. This inspects each call's `where`
 * shape and routes to the right configured fixture instead.
 */
function makePrisma(
  opts: {
    activeLockRow?: unknown;
    expiredLockRow?: unknown;
    activeCodeRow?: unknown;
    latestRow?: unknown;
  } = {},
) {
  const findFirst = jest.fn(
    async ({ where }: { where: Record<string, any> }) => {
      if (where.lockedUntil && "gt" in where.lockedUntil) {
        return opts.activeLockRow ?? null;
      }
      if (where.lockedUntil && "lte" in where.lockedUntil) {
        return opts.expiredLockRow ?? null;
      }
      if ("expiresAt" in where) {
        return opts.activeCodeRow ?? null;
      }
      // Plain { phoneE164 } — requestOtp's cooldown lookup, or
      // maybeTriggerLockout's "stamp the latest row" lookup.
      return opts.latestRow ?? null;
    },
  );

  return {
    phoneOtp: {
      findFirst,
      updateMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    },
  };
}

function makeSms(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sendVerificationCode: jest.fn().mockResolvedValue(true),
    isMockMode: jest.fn().mockReturnValue(true),
    ...overrides,
  };
}

describe("OtpService.requestOtp", () => {
  const originalSecret = process.env.JWT_SECRET;
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
  });
  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it("refuses a new code while the phone is locked", async () => {
    const prisma = makePrisma({ activeLockRow: { id: "locked-row" } });
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(svc.requestOtp("+905551234567")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.phoneOtp.create).not.toHaveBeenCalled();
  });

  it("refuses a resend inside the 60s cooldown", async () => {
    const prisma = makePrisma({
      latestRow: { createdAt: new Date(Date.now() - 5_000) }, // 5s ago
    });
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(svc.requestOtp("+905551234567")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.phoneOtp.create).not.toHaveBeenCalled();
  });

  it("allows a resend once the cooldown has elapsed", async () => {
    const prisma = makePrisma({
      latestRow: { createdAt: new Date(Date.now() - 61_000) }, // 61s ago
    });
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(svc.requestOtp("+905551234567")).resolves.toEqual({
      expiresAt: expect.any(Date),
    });
    expect(prisma.phoneOtp.create).toHaveBeenCalledTimes(1);
  });

  it("invalidates a still-active prior code before creating the new one", async () => {
    const prisma = makePrisma(); // no prior row at all
    const svc = new OtpService(prisma as never, makeSms() as never);

    await svc.requestOtp("+905551234567");

    expect(prisma.phoneOtp.updateMany).toHaveBeenCalledWith({
      where: {
        phoneE164: "+905551234567",
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { expiresAt: expect.any(Date) },
    });
    expect(prisma.phoneOtp.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phoneE164: "+905551234567",
        codeHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
  });

  it("sets expiresAt roughly 10 minutes out", async () => {
    const prisma = makePrisma();
    const svc = new OtpService(prisma as never, makeSms() as never);

    const before = Date.now();
    const result = await svc.requestOtp("+905551234567");
    const ttlMs = result.expiresAt.getTime() - before;

    expect(ttlMs).toBeGreaterThan(9 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(10 * 60_000 + 1000);
  });

  // Regression coverage for a Critical finding: requestOtp used to echo the
  // raw OTP code back in its HTTP response body whenever the mock SMS
  // provider was active — an unauthenticated account-takeover primitive if
  // NODE_ENV was ever unset/misspelled in a real deploy (previously
  // silently treated as "development"). The code must NEVER appear in the
  // response, in ANY mode — this pins the exact response shape so a future
  // change can't silently reintroduce a code-bearing field.
  it("never includes the code (or any extra field) in the response, in mock mode", async () => {
    const prisma = makePrisma();
    const svc = new OtpService(prisma as never, makeSms() as never);

    const result = await svc.requestOtp("+905551234567");

    expect(Object.keys(result)).toEqual(["expiresAt"]);
  });

  it("never includes the code (or any extra field) in the response, in non-mock mode", async () => {
    const prisma = makePrisma();
    const sms = makeSms({ isMockMode: jest.fn().mockReturnValue(false) });
    const svc = new OtpService(prisma as never, sms as never);

    const result = await svc.requestOtp("+905551234567");

    expect(Object.keys(result)).toEqual(["expiresAt"]);
  });
});

describe("OtpService.verifyOtp", () => {
  const originalSecret = process.env.JWT_SECRET;
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
  });
  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it("throws the uniform error while the phone is locked", async () => {
    const prisma = makePrisma({ activeLockRow: { id: "locked-row" } });
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(
      svc.verifyOtp("+905551234567", "123456"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);
  });

  // Regression coverage for the Important finding: the lock check must
  // scan ALL of the phone's rows for an active lockedUntil, not just the
  // newest-by-createdAt row — otherwise a concurrent requestOtp() that
  // inserts a fresh (lockedUntil: null) row silently erases an active
  // lock. Here the "lock" and the "active code" live on DIFFERENT rows
  // (an old row still carries the lock; a newer row is the currently
  // verifiable code) and the lock must still win.
  it("stays locked even when a NEWER row has no lock of its own (race-free against a fresh insert)", async () => {
    const prisma = makePrisma({
      activeLockRow: { id: "old-locked-row" }, // found regardless of "newest"
      activeCodeRow: {
        id: "new-unlocked-row",
        codeHash: hashOtp("123456"),
        attemptCount: 0,
      },
    });
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(
      svc.verifyOtp("+905551234567", "123456"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);
    // Never even reached the attempt-increment claim.
    expect(prisma.phoneOtp.updateMany).not.toHaveBeenCalled();
  });

  it("throws the uniform error when there is no active (unexpired, unconsumed) code", async () => {
    const prisma = makePrisma({ activeCodeRow: null });
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(
      svc.verifyOtp("+905551234567", "123456"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);
  });

  it("throws the uniform error and does not decrement further when attempts are already exhausted", async () => {
    const prisma = makePrisma({
      activeCodeRow: {
        id: "otp-1",
        codeHash: hashOtp("123456"),
        attemptCount: OTP_MAX_ATTEMPTS,
      },
    });
    prisma.phoneOtp.updateMany.mockResolvedValueOnce({ count: 0 }); // claim fails
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(
      svc.verifyOtp("+905551234567", "123456"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);
  });

  it("throws the uniform error on a wrong code and still counts the attempt", async () => {
    const prisma = makePrisma({
      activeCodeRow: {
        id: "otp-1",
        codeHash: hashOtp("123456"),
        attemptCount: 0,
      },
    });
    prisma.phoneOtp.updateMany.mockResolvedValueOnce({ count: 1 }); // claim succeeds
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(
      svc.verifyOtp("+905551234567", "000000"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);

    expect(prisma.phoneOtp.updateMany).toHaveBeenCalledWith({
      where: {
        id: "otp-1",
        attemptCount: { lt: OTP_MAX_ATTEMPTS },
        consumedAt: null,
      },
      data: { attemptCount: { increment: 1 } },
    });
  });

  it("succeeds on a correct code and marks consumedAt", async () => {
    const prisma = makePrisma({
      activeCodeRow: {
        id: "otp-1",
        codeHash: hashOtp("123456"),
        attemptCount: 0,
      },
    });
    prisma.phoneOtp.updateMany
      .mockResolvedValueOnce({ count: 1 }) // attempt-increment claim
      .mockResolvedValueOnce({ count: 1 }); // consumedAt stamp
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(svc.verifyOtp("+905551234567", "123456")).resolves.toEqual({
      verified: true,
    });

    expect(prisma.phoneOtp.updateMany).toHaveBeenLastCalledWith({
      where: { id: "otp-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("locks the phone once the failed-code count reaches the threshold", async () => {
    const prisma = makePrisma({
      activeCodeRow: {
        id: "otp-1",
        codeHash: hashOtp("123456"),
        attemptCount: 0,
      },
      latestRow: { id: "otp-latest" },
    });
    prisma.phoneOtp.updateMany.mockResolvedValueOnce({ count: 1 });
    // First count() call is isLocked's own precheck, BEFORE this attempt —
    // still one under threshold, so the call is allowed to proceed. The
    // second is maybeTriggerLockout's recompute AFTER this wrong guess
    // just burned the code that tips the count over the threshold.
    prisma.phoneOtp.count
      .mockResolvedValueOnce(OTP_FAILED_CODE_LOCKOUT_THRESHOLD - 1)
      .mockResolvedValueOnce(OTP_FAILED_CODE_LOCKOUT_THRESHOLD);
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(
      svc.verifyOtp("+905551234567", "wrong-code"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);

    expect(prisma.phoneOtp.update).toHaveBeenCalledWith({
      where: { id: "otp-latest" },
      data: { lockedUntil: expect.any(Date) },
    });
  });

  it("does not lock the phone while the burned-code count is below the threshold", async () => {
    const prisma = makePrisma({
      activeCodeRow: {
        id: "otp-1",
        codeHash: hashOtp("123456"),
        attemptCount: 0,
      },
    });
    prisma.phoneOtp.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.phoneOtp.count.mockResolvedValue(
      OTP_FAILED_CODE_LOCKOUT_THRESHOLD - 1,
    );
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(
      svc.verifyOtp("+905551234567", "wrong-code"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);

    expect(prisma.phoneOtp.update).not.toHaveBeenCalled();
  });

  // Regression coverage for the second half of the Important finding: once
  // a previous lock has expired, the codes that triggered it must not
  // count toward a NEW lock — otherwise a legitimate user's very first
  // retry after the lock "expires" immediately re-locks them (the old
  // burned codes are still inside a naive rolling 24h window). The
  // burned-code count query must be anchored at the expired lock's
  // `lockedUntil`, not `now - 24h`.
  it("anchors the burned-code window at the previous lock's expiry, not a naive rolling 24h", async () => {
    const expiredAt = new Date(Date.now() - 60_000); // lock expired 1 minute ago
    const prisma = makePrisma({
      activeCodeRow: {
        id: "otp-1",
        codeHash: hashOtp("123456"),
        attemptCount: 0,
      },
      expiredLockRow: { lockedUntil: expiredAt },
      latestRow: { id: "otp-latest" },
    });
    prisma.phoneOtp.updateMany.mockResolvedValueOnce({ count: 1 });
    // Below threshold so no re-lock fires; the assertion is on the WINDOW
    // the count query used, not on the outcome.
    prisma.phoneOtp.count.mockResolvedValue(1);

    const svc = new OtpService(prisma as never, makeSms() as never);
    await expect(
      svc.verifyOtp("+905551234567", "wrong-code"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);

    const countArgs = prisma.phoneOtp.count.mock.calls[0][0];
    expect(countArgs.where.createdAt.gte).toEqual(expiredAt);
  });
});
