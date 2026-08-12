import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy";

// No JS default parameter here on purpose — a default kicks in even when
// the caller explicitly passes `undefined`, which would silently defeat
// the "JWT_SECRET missing" test case below.
function makeConfig(secret: string | undefined) {
  return { get: () => secret } as any;
}

function makePrisma() {
  return {
    user: { findUnique: jest.fn() },
    merchantUser: { findUnique: jest.fn() },
    adminUser: { findUnique: jest.fn() },
  };
}

describe("JwtStrategy — fail-fast boot check", () => {
  it("throws at construction when JWT_SECRET is not configured", () => {
    expect(
      () => new JwtStrategy(makeConfig(undefined), makePrisma() as any),
    ).toThrow(/JWT_SECRET is not configured/);
  });

  it("constructs successfully when JWT_SECRET is set", () => {
    expect(
      () => new JwtStrategy(makeConfig("a-real-secret"), makePrisma() as any),
    ).not.toThrow();
  });
});

describe("JwtStrategy.validate", () => {
  it("returns a CONSUMER principal for an active user", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
    const strategy = new JwtStrategy(makeConfig("test-secret"), prisma as any);

    const result = await strategy.validate({ sub: "u1", actor: "CONSUMER" });

    expect(result).toEqual({ id: "u1", actor: "CONSUMER" });
  });

  it("rejects a CONSUMER whose account is BANNED", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", status: "BANNED" });
    const strategy = new JwtStrategy(makeConfig("test-secret"), prisma as any);

    await expect(
      strategy.validate({ sub: "u1", actor: "CONSUMER" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a CONSUMER whose user row no longer exists", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const strategy = new JwtStrategy(makeConfig("test-secret"), prisma as any);

    await expect(
      strategy.validate({ sub: "gone", actor: "CONSUMER" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns a MERCHANT principal with merchantId + role", async () => {
    const prisma = makePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "mu1",
      merchantId: "m1",
      role: "OWNER",
    });
    const strategy = new JwtStrategy(makeConfig("test-secret"), prisma as any);

    const result = await strategy.validate({
      sub: "mu1",
      actor: "MERCHANT",
      merchantId: "m1",
      role: "OWNER",
    });

    expect(result).toEqual({
      id: "mu1",
      actor: "MERCHANT",
      merchantId: "m1",
      role: "OWNER",
    });
  });

  it("rejects a MERCHANT whose row no longer exists", async () => {
    const prisma = makePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue(null);
    const strategy = new JwtStrategy(makeConfig("test-secret"), prisma as any);

    await expect(
      strategy.validate({ sub: "gone", actor: "MERCHANT" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns an ADMIN principal for an active admin", async () => {
    const prisma = makePrisma();
    prisma.adminUser.findUnique.mockResolvedValue({ id: "au1", active: true });
    const strategy = new JwtStrategy(makeConfig("test-secret"), prisma as any);

    const result = await strategy.validate({ sub: "au1", actor: "ADMIN" });

    expect(result).toEqual({ id: "au1", actor: "ADMIN" });
  });

  it("rejects a deactivated ADMIN", async () => {
    const prisma = makePrisma();
    prisma.adminUser.findUnique.mockResolvedValue({
      id: "au1",
      active: false,
    });
    const strategy = new JwtStrategy(makeConfig("test-secret"), prisma as any);

    await expect(
      strategy.validate({ sub: "au1", actor: "ADMIN" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects an unrecognized actor value", async () => {
    const prisma = makePrisma();
    const strategy = new JwtStrategy(makeConfig("test-secret"), prisma as any);

    await expect(
      strategy.validate({ sub: "x", actor: "ROBOT" as any }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
