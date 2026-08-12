import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    merchantUser: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    adminUser: {
      findUnique: jest.fn(),
    },
  };
}

function makeOtpService() {
  return {
    requestOtp: jest.fn(),
    verifyOtp: jest.fn().mockResolvedValue({ verified: true }),
  };
}

function makeTokenService() {
  return {
    issueTokens: jest.fn().mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      refreshTokenExpiresAt: new Date(Date.now() + 1000),
    }),
  };
}

describe("AuthService.verifyConsumerOtp", () => {
  it("creates a new User on first verify and sets phoneVerifiedAt", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "u1",
      phoneE164: "+905551234567",
      status: "ACTIVE",
      name: null,
    });
    const otp = makeOtpService();
    const tokens = makeTokenService();
    const svc = new AuthService(prisma as any, otp as any, tokens as any);

    const result = await svc.verifyConsumerOtp("+905551234567", "123456");

    expect(otp.verifyOtp).toHaveBeenCalledWith("+905551234567", "123456");
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        phoneE164: "+905551234567",
        phoneVerifiedAt: expect.any(Date),
      },
    });
    expect(tokens.issueTokens).toHaveBeenCalledWith({
      id: "u1",
      actor: "CONSUMER",
    });
    expect(result.accessToken).toBe("access");
    expect(result.user).toMatchObject({ id: "u1" });
  });

  it("refreshes phoneVerifiedAt on an existing ACTIVE user", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      phoneE164: "+905551234567",
      status: "ACTIVE",
    });
    prisma.user.update.mockResolvedValue({
      id: "u1",
      phoneE164: "+905551234567",
      status: "ACTIVE",
      name: "Ada",
    });
    const otp = makeOtpService();
    const tokens = makeTokenService();
    const svc = new AuthService(prisma as any, otp as any, tokens as any);

    await svc.verifyConsumerOtp("+905551234567", "123456");

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { phoneVerifiedAt: expect.any(Date) },
    });
  });

  it("refuses a BANNED user with an explicit error code, without issuing tokens", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      phoneE164: "+905551234567",
      status: "BANNED",
    });
    const otp = makeOtpService();
    const tokens = makeTokenService();
    const svc = new AuthService(prisma as any, otp as any, tokens as any);

    await expect(
      svc.verifyConsumerOtp("+905551234567", "123456"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ errorCode: "ACCOUNT_BANNED" }),
    });
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it("refuses a DELETED user with an explicit error code", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      phoneE164: "+905551234567",
      status: "DELETED",
    });
    const otp = makeOtpService();
    const tokens = makeTokenService();
    const svc = new AuthService(prisma as any, otp as any, tokens as any);

    await expect(
      svc.verifyConsumerOtp("+905551234567", "123456"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it("propagates OtpService's rejection without touching the User table", async () => {
    const prisma = makePrisma();
    const otp = makeOtpService();
    otp.verifyOtp.mockRejectedValue(new UnauthorizedException("bad code"));
    const tokens = makeTokenService();
    const svc = new AuthService(prisma as any, otp as any, tokens as any);

    await expect(
      svc.verifyConsumerOtp("+905551234567", "000000"),
    ).rejects.toThrow("bad code");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("AuthService.merchantLogin", () => {
  it("issues MERCHANT tokens on a correct password and bumps lastLoginAt", async () => {
    const prisma = makePrisma();
    const hash = await bcrypt.hash("correct-horse", 4);
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "mu1",
      email: "owner@bakery.test",
      passwordHash: hash,
      role: "OWNER",
      merchantId: "m1",
    });
    const otp = makeOtpService();
    const tokens = makeTokenService();
    const svc = new AuthService(prisma as any, otp as any, tokens as any);

    const result = await svc.merchantLogin(
      "owner@bakery.test",
      "correct-horse",
    );

    expect(prisma.merchantUser.update).toHaveBeenCalledWith({
      where: { id: "mu1" },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(tokens.issueTokens).toHaveBeenCalledWith({
      id: "mu1",
      actor: "MERCHANT",
      merchantId: "m1",
      role: "OWNER",
    });
    expect(result.accessToken).toBe("access");
  });

  it("rejects a wrong password without leaking which part was wrong", async () => {
    const prisma = makePrisma();
    const hash = await bcrypt.hash("correct-horse", 4);
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "mu1",
      email: "owner@bakery.test",
      passwordHash: hash,
      role: "OWNER",
      merchantId: "m1",
    });
    const otp = makeOtpService();
    const tokens = makeTokenService();
    const svc = new AuthService(prisma as any, otp as any, tokens as any);

    await expect(
      svc.merchantLogin("owner@bakery.test", "wrong-password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it("rejects an unknown email (still runs a bcrypt compare against a dummy hash)", async () => {
    const prisma = makePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue(null);
    const otp = makeOtpService();
    const tokens = makeTokenService();
    const svc = new AuthService(prisma as any, otp as any, tokens as any);

    await expect(
      svc.merchantLogin("nobody@nowhere.test", "anything"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });
});

describe("AuthService.adminLogin", () => {
  it("issues ADMIN tokens for an active admin with the correct password", async () => {
    const prisma = makePrisma();
    const hash = await bcrypt.hash("s3cret", 4);
    prisma.adminUser.findUnique.mockResolvedValue({
      id: "au1",
      email: "root@kurtar.test",
      passwordHash: hash,
      name: "Root",
      active: true,
    });
    const otp = makeOtpService();
    const tokens = makeTokenService();
    const svc = new AuthService(prisma as any, otp as any, tokens as any);

    const result = await svc.adminLogin("root@kurtar.test", "s3cret");

    expect(tokens.issueTokens).toHaveBeenCalledWith({
      id: "au1",
      actor: "ADMIN",
    });
    expect(result.accessToken).toBe("access");
  });

  it("rejects a deactivated admin even with the correct password", async () => {
    const prisma = makePrisma();
    const hash = await bcrypt.hash("s3cret", 4);
    prisma.adminUser.findUnique.mockResolvedValue({
      id: "au1",
      email: "root@kurtar.test",
      passwordHash: hash,
      name: "Root",
      active: false,
    });
    const otp = makeOtpService();
    const tokens = makeTokenService();
    const svc = new AuthService(prisma as any, otp as any, tokens as any);

    await expect(
      svc.adminLogin("root@kurtar.test", "s3cret"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });
});
