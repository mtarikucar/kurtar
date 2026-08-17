import { PrismaClient } from "@prisma/client";
import { OTP_MAX_ATTEMPTS, OtpService } from "./otp.service";
import { hashOtp } from "./otp.helpers";
import { PrismaService } from "../../prisma/prisma.service";
import { SmsService } from "../sms/sms.service";

/**
 * Real-DB concurrency proof for OtpService.verifyOtp's atomic attempt
 * increment. Only runs when TEST_DATABASE_URL is set (Task 2's realdb gate
 * pattern — see backend/src/prisma/schema.realdb.spec.ts) so the normal
 * mocked unit suite (otp.service.spec.ts) is unaffected.
 *
 * The property under test: two verify() calls racing against the SAME OTP
 * row must both be counted (no lost update) — the increment has to be a
 * single conditional `UPDATE ... SET attemptCount = attemptCount + 1
 * WHERE attemptCount < max`, not a read-then-write, or two parallel wrong
 * guesses could both read attemptCount=0 and both write back 1.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

d("OtpService — real DB concurrency", () => {
  let prisma: PrismaClient;
  let otpService: OtpService;
  const phone = "+905550001199";
  let otpId: string;

  // verifyOtp never calls SmsService, so a minimal stub is enough.
  const stubSms = {
    sendVerificationCode: async () => true,
    isMockMode: () => true,
  } as unknown as SmsService;

  beforeAll(() => {
    // [Fix round #3] JWT_SECRET no longer set here — test/jest.setup.ts
    // now guarantees it globally, order-independent, for every spec file.
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    otpService = new OtpService(prisma as unknown as PrismaService, stubSms);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.phoneOtp
      .deleteMany({ where: { phoneE164: phone } })
      .catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.phoneOtp.deleteMany({ where: { phoneE164: phone } });
    const row = await prisma.phoneOtp.create({
      data: {
        phoneE164: phone,
        codeHash: hashOtp("123456"),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    otpId = row.id;
  });

  it("counts two parallel wrong-code verify attempts atomically (no lost update)", async () => {
    const results = await Promise.allSettled([
      otpService.verifyOtp(phone, "000000"),
      otpService.verifyOtp(phone, "111111"),
    ]);

    expect(results.every((r) => r.status === "rejected")).toBe(true);

    const row = await prisma.phoneOtp.findUniqueOrThrow({
      where: { id: otpId },
    });
    // Without atomicity, two racing read-then-write increments would
    // often collapse to 1. This must be exactly 2.
    expect(row.attemptCount).toBe(2);
  });

  it("caps at OTP_MAX_ATTEMPTS even when two callers race for the last slot", async () => {
    await prisma.phoneOtp.update({
      where: { id: otpId },
      data: { attemptCount: OTP_MAX_ATTEMPTS - 1 },
    });

    const results = await Promise.allSettled([
      otpService.verifyOtp(phone, "000000"),
      otpService.verifyOtp(phone, "111111"),
    ]);

    expect(results.every((r) => r.status === "rejected")).toBe(true);

    const row = await prisma.phoneOtp.findUniqueOrThrow({
      where: { id: otpId },
    });
    // Exactly one of the two claims the last slot; the other's
    // conditional update matches 0 rows. Never OTP_MAX_ATTEMPTS + 1.
    expect(row.attemptCount).toBe(OTP_MAX_ATTEMPTS);
  });
});
