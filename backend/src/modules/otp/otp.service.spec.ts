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

function makePrisma() {
  return {
    phoneOtp: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
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
    const prisma = makePrisma();
    prisma.phoneOtp.findFirst.mockResolvedValue({
      lockedUntil: new Date(Date.now() + 60_000),
      createdAt: new Date(Date.now() - 3_600_000),
    });
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(svc.requestOtp("+905551234567")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.phoneOtp.create).not.toHaveBeenCalled();
  });

  it("refuses a resend inside the 60s cooldown", async () => {
    const prisma = makePrisma();
    prisma.phoneOtp.findFirst.mockResolvedValue({
      lockedUntil: null,
      createdAt: new Date(Date.now() - 5_000), // 5s ago
    });
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(svc.requestOtp("+905551234567")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.phoneOtp.create).not.toHaveBeenCalled();
  });

  it("allows a resend once the cooldown has elapsed", async () => {
    const prisma = makePrisma();
    prisma.phoneOtp.findFirst.mockResolvedValue({
      lockedUntil: null,
      createdAt: new Date(Date.now() - 61_000), // 61s ago
    });
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(svc.requestOtp("+905551234567")).resolves.toMatchObject({
      devCode: expect.stringMatching(/^\d{6}$/),
    });
    expect(prisma.phoneOtp.create).toHaveBeenCalledTimes(1);
  });

  it("invalidates a still-active prior code before creating the new one", async () => {
    const prisma = makePrisma();
    prisma.phoneOtp.findFirst.mockResolvedValue(null); // no prior row at all
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

  it("sets expiresAt roughly 10 minutes out and echoes devCode only in mock mode", async () => {
    const prisma = makePrisma();
    prisma.phoneOtp.findFirst.mockResolvedValue(null);
    const svc = new OtpService(prisma as never, makeSms() as never);

    const before = Date.now();
    const result = await svc.requestOtp("+905551234567");
    const ttlMs = result.expiresAt.getTime() - before;

    expect(ttlMs).toBeGreaterThan(9 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(10 * 60_000 + 1000);
    expect(result.devCode).toMatch(/^\d{6}$/);
  });

  it("omits devCode when SMS is not running the mock provider", async () => {
    const prisma = makePrisma();
    prisma.phoneOtp.findFirst.mockResolvedValue(null);
    const sms = makeSms({ isMockMode: jest.fn().mockReturnValue(false) });
    const svc = new OtpService(prisma as never, sms as never);

    const result = await svc.requestOtp("+905551234567");

    expect(result.devCode).toBeUndefined();
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

  function notLocked(prisma: ReturnType<typeof makePrisma>) {
    // assertNotLocked's own findFirst call — return no lock.
    prisma.phoneOtp.findFirst.mockResolvedValueOnce({ lockedUntil: null });
  }

  it("throws the uniform error while the phone is locked", async () => {
    const prisma = makePrisma();
    prisma.phoneOtp.findFirst.mockResolvedValueOnce({
      lockedUntil: new Date(Date.now() + 60_000),
    });
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(
      svc.verifyOtp("+905551234567", "123456"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);
  });

  it("throws the uniform error when there is no active (unexpired, unconsumed) code", async () => {
    const prisma = makePrisma();
    notLocked(prisma);
    prisma.phoneOtp.findFirst.mockResolvedValueOnce(null); // active-code lookup
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(
      svc.verifyOtp("+905551234567", "123456"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);

    // TTL is enforced at the query layer, not after the fact.
    const activeLookupArgs = prisma.phoneOtp.findFirst.mock.calls[1][0];
    expect(activeLookupArgs.where).toMatchObject({
      consumedAt: null,
      expiresAt: { gt: expect.any(Date) },
    });
  });

  it("throws the uniform error and does not decrement further when attempts are already exhausted", async () => {
    const prisma = makePrisma();
    notLocked(prisma);
    prisma.phoneOtp.findFirst.mockResolvedValueOnce({
      id: "otp-1",
      codeHash: hashOtp("123456"),
      attemptCount: OTP_MAX_ATTEMPTS,
    });
    prisma.phoneOtp.updateMany.mockResolvedValueOnce({ count: 0 }); // claim fails
    prisma.phoneOtp.count.mockResolvedValue(0);
    const svc = new OtpService(prisma as never, makeSms() as never);

    await expect(
      svc.verifyOtp("+905551234567", "123456"),
    ).rejects.toBeInstanceOf(OtpVerificationFailedException);
  });

  it("throws the uniform error on a wrong code and still counts the attempt", async () => {
    const prisma = makePrisma();
    notLocked(prisma);
    prisma.phoneOtp.findFirst.mockResolvedValueOnce({
      id: "otp-1",
      codeHash: hashOtp("123456"),
      attemptCount: 0,
    });
    prisma.phoneOtp.updateMany.mockResolvedValueOnce({ count: 1 }); // claim succeeds
    prisma.phoneOtp.count.mockResolvedValue(0);
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
    const prisma = makePrisma();
    notLocked(prisma);
    prisma.phoneOtp.findFirst.mockResolvedValueOnce({
      id: "otp-1",
      codeHash: hashOtp("123456"),
      attemptCount: 0,
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
    const prisma = makePrisma();
    notLocked(prisma);
    prisma.phoneOtp.findFirst.mockResolvedValueOnce({
      id: "otp-1",
      codeHash: hashOtp("123456"),
      attemptCount: 0,
    });
    prisma.phoneOtp.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.phoneOtp.count.mockResolvedValue(OTP_FAILED_CODE_LOCKOUT_THRESHOLD);
    prisma.phoneOtp.findFirst.mockResolvedValueOnce({ id: "otp-latest" });
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
    const prisma = makePrisma();
    notLocked(prisma);
    prisma.phoneOtp.findFirst.mockResolvedValueOnce({
      id: "otp-1",
      codeHash: hashOtp("123456"),
      attemptCount: 0,
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
});
