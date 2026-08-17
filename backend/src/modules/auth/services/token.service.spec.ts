import { UnauthorizedException } from "@nestjs/common";
import { createHash } from "crypto";
import { TokenService } from "./token.service";

function makeJwt() {
  return { sign: jest.fn().mockReturnValue("signed-access-token") };
}

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "30d",
    ...overrides,
  };
  return { get: (key: string) => values[key] } as any;
}

function makePrisma() {
  const tx = {
    refreshToken: {
      updateMany: jest.fn(),
      // The actor pre-check refresh() runs before the atomic claim. null
      // = "no such token row", which is exactly what an unknown token
      // looks like and lets the claim itself decide the outcome.
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
    },
    user: { findUnique: jest.fn() },
    merchantUser: { findUnique: jest.fn() },
    adminUser: { findUnique: jest.fn() },
  };
  return {
    tx,
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
}

describe("TokenService — [B5] JWT_REFRESH_EXPIRES_IN boot validation", () => {
  it("refuses to construct with a malformed JWT_REFRESH_EXPIRES_IN instead of only failing lazily at first login/refresh", () => {
    expect(
      () =>
        new TokenService(
          makePrisma() as any,
          makeJwt() as any,
          makeConfig({ JWT_REFRESH_EXPIRES_IN: "30days" }),
        ),
    ).toThrow(/Invalid duration "30days"/);
  });

  it("refuses to construct with an empty-unit malformed value", () => {
    expect(
      () =>
        new TokenService(
          makePrisma() as any,
          makeJwt() as any,
          makeConfig({ JWT_REFRESH_EXPIRES_IN: "notaduration" }),
        ),
    ).toThrow(/Invalid duration/);
  });

  it("constructs successfully with a valid JWT_REFRESH_EXPIRES_IN", () => {
    expect(
      () =>
        new TokenService(
          makePrisma() as any,
          makeJwt() as any,
          makeConfig({ JWT_REFRESH_EXPIRES_IN: "45d" }),
        ),
    ).not.toThrow();
  });

  it("constructs successfully when JWT_REFRESH_EXPIRES_IN is unset (falls back to the 30d default)", () => {
    expect(
      () =>
        new TokenService(
          makePrisma() as any,
          makeJwt() as any,
          makeConfig({
            JWT_REFRESH_EXPIRES_IN: undefined as unknown as string,
          }),
        ),
    ).not.toThrow();
  });
});

describe("TokenService.hashToken", () => {
  it("produces the sha256 hex of the input", () => {
    const svc = new TokenService(
      makePrisma() as any,
      makeJwt() as any,
      makeConfig(),
    );
    expect(svc.hashToken("abc")).toBe(
      createHash("sha256").update("abc").digest("hex"),
    );
  });
});

describe("TokenService.issueTokens", () => {
  it("mints an access token and persists a hashed opaque refresh token row", async () => {
    const prisma = makePrisma();
    const jwt = makeJwt();
    const svc = new TokenService(prisma as any, jwt as any, makeConfig());

    const result = await svc.issueTokens({ id: "u1", actor: "CONSUMER" });

    expect(result.accessToken).toBe("signed-access-token");
    expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: "u1", actor: "CONSUMER" },
      { secret: "test-secret", expiresIn: "15m", algorithm: "HS256" },
    );
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        principalType: "CONSUMER",
        userId: "u1",
        merchantUserId: null,
        adminUserId: null,
        tokenHash: svc.hashToken(result.refreshToken),
        familyId: expect.any(String),
        expiresAt: result.refreshTokenExpiresAt,
      }),
    });
  });

  it("includes merchantId/role in the access-token payload for MERCHANT", async () => {
    const prisma = makePrisma();
    const jwt = makeJwt();
    const svc = new TokenService(prisma as any, jwt as any, makeConfig());

    await svc.issueTokens({
      id: "mu1",
      actor: "MERCHANT",
      merchantId: "m1",
      role: "OWNER",
    });

    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: "mu1", actor: "MERCHANT", merchantId: "m1", role: "OWNER" },
      expect.any(Object),
    );
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        principalType: "MERCHANT",
        userId: null,
        merchantUserId: "mu1",
        adminUserId: null,
      }),
    });
  });
});

describe("TokenService.refresh", () => {
  it("rotates a valid CONSUMER token and mints a fresh pair", async () => {
    const prisma = makePrisma();
    prisma.tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.tx.refreshToken.findUniqueOrThrow.mockResolvedValue({
      principalType: "CONSUMER",
      userId: "u1",
      merchantUserId: null,
      adminUserId: null,
      familyId: "fam-1",
    });
    prisma.tx.refreshToken.findUnique.mockResolvedValue({
      principalType: "CONSUMER",
    });
    prisma.tx.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
    const jwt = makeJwt();
    const svc = new TokenService(prisma as any, jwt as any, makeConfig());

    const result = await svc.refresh("old-raw-token", "CONSUMER");

    expect(result.accessToken).toBe("signed-access-token");
    expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: "u1", actor: "CONSUMER" },
      expect.any(Object),
    );
    expect(prisma.tx.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        principalType: "CONSUMER",
        userId: "u1",
        familyId: "fam-1",
      }),
    });
    // Outside-the-transaction diagnostic revoke must NOT fire on the
    // happy path.
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("rejects with a plain 401 and no revoke for an unknown token", async () => {
    const prisma = makePrisma();
    prisma.tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await expect(svc.refresh("nonexistent", "CONSUMER")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("rejects with a plain 401 and no revoke for a naturally expired token", async () => {
    const prisma = makePrisma();
    prisma.tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.refreshToken.findUnique.mockResolvedValue({
      familyId: "fam-1",
      expiresAt: new Date(Date.now() - 1000),
    });
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await expect(svc.refresh("expired", "CONSUMER")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("detects reuse of an already-rotated token and revokes the family", async () => {
    const prisma = makePrisma();
    prisma.tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.refreshToken.findUnique.mockResolvedValue({
      familyId: "fam-1",
      expiresAt: new Date(Date.now() + 100_000),
    });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await expect(svc.refresh("already-rotated", "CONSUMER")).rejects.toThrow(
      /Invalid refresh token/,
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "fam-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("revokes the family (inside the transaction) and rejects when the CONSUMER principal is no longer active", async () => {
    const prisma = makePrisma();
    prisma.tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.tx.refreshToken.findUniqueOrThrow.mockResolvedValue({
      principalType: "CONSUMER",
      userId: "u1",
      merchantUserId: null,
      adminUserId: null,
      familyId: "fam-1",
    });
    prisma.tx.refreshToken.findUnique.mockResolvedValue({
      principalType: "CONSUMER",
    });
    prisma.tx.user.findUnique.mockResolvedValue({ id: "u1", status: "BANNED" });
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await expect(svc.refresh("stale-banned", "CONSUMER")).rejects.toThrow(
      /Invalid refresh token/,
    );
    // Revoked INSIDE the transaction, not via the outside diagnostic path.
    expect(prisma.tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "fam-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.tx.refreshToken.create).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when the MERCHANT principal row no longer exists", async () => {
    const prisma = makePrisma();
    prisma.tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.tx.refreshToken.findUniqueOrThrow.mockResolvedValue({
      principalType: "MERCHANT",
      userId: null,
      merchantUserId: "mu1",
      adminUserId: null,
      familyId: "fam-2",
    });
    prisma.tx.refreshToken.findUnique.mockResolvedValue({
      principalType: "MERCHANT",
    });
    prisma.tx.merchantUser.findUnique.mockResolvedValue(null);
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await expect(svc.refresh("deleted-merchant", "MERCHANT")).rejects.toThrow(
      /Invalid refresh token/,
    );
    expect(prisma.tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it("rejects when the ADMIN principal is deactivated", async () => {
    const prisma = makePrisma();
    prisma.tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.tx.refreshToken.findUniqueOrThrow.mockResolvedValue({
      principalType: "ADMIN",
      userId: null,
      merchantUserId: null,
      adminUserId: "au1",
      familyId: "fam-3",
    });
    prisma.tx.refreshToken.findUnique.mockResolvedValue({
      principalType: "ADMIN",
    });
    prisma.tx.adminUser.findUnique.mockResolvedValue({
      id: "au1",
      active: false,
    });
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await expect(svc.refresh("deactivated-admin", "ADMIN")).rejects.toThrow(
      /Invalid refresh token/,
    );
    expect(prisma.tx.refreshToken.create).not.toHaveBeenCalled();
  });

  // --- actor binding (the cross-actor session-bleed fix) -------------
  // See refresh-cookie-transport.util.ts's ACTOR SCOPING note. Per-actor
  // cookie names/paths stop the browser from volunteering the wrong
  // cookie; THIS is what stops a hand-crafted request that presents one
  // anyway (an XSS on a merchant surface replaying the cookie it can
  // reach onto /api/auth/admin/refresh).
  it("refuses to mint an ADMIN session from a MERCHANT-bound refresh token", async () => {
    const prisma = makePrisma();
    prisma.tx.refreshToken.findUnique.mockResolvedValue({
      principalType: "MERCHANT",
    });
    // Everything below would make this a perfectly claimable, perfectly
    // valid MERCHANT rotation — the ONLY thing wrong is the route it
    // arrived on.
    prisma.tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.tx.refreshToken.findUniqueOrThrow.mockResolvedValue({
      principalType: "MERCHANT",
      userId: null,
      merchantUserId: "mu1",
      adminUserId: null,
      familyId: "fam-x",
    });
    prisma.tx.merchantUser.findUnique.mockResolvedValue({
      id: "mu1",
      merchantId: "m1",
      role: "OWNER",
    });
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await expect(svc.refresh("merchant-token", "ADMIN")).rejects.toThrow(
      /Invalid refresh token/,
    );
    // Rejected BEFORE the claim: no rotation, no successor row, and
    // above all no ADMIN access token.
    expect(prisma.tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it("does not revoke the merchant's own family when its token is replayed on the admin route", async () => {
    const prisma = makePrisma();
    prisma.tx.refreshToken.findUnique.mockResolvedValue({
      principalType: "MERCHANT",
    });
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await expect(svc.refresh("merchant-token", "ADMIN")).rejects.toThrow(
      /Invalid refresh token/,
    );
    // Family-revoking on a mismatch would hand every same-site surface a
    // free "log that other actor out of this browser" primitive.
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe("TokenService.revokeFamilyByToken", () => {
  it("revokes every active row in the token's family", async () => {
    const prisma = makePrisma();
    prisma.refreshToken.findUnique.mockResolvedValue({
      familyId: "fam-9",
      principalType: "MERCHANT",
    });
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await svc.revokeFamilyByToken("some-token", "MERCHANT");

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "fam-9", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("no-ops silently for an unknown token", async () => {
    const prisma = makePrisma();
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await svc.revokeFamilyByToken("unknown-token", "MERCHANT");

    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("no-ops for a token belonging to a different actor (logout is not a cross-actor weapon)", async () => {
    const prisma = makePrisma();
    prisma.refreshToken.findUnique.mockResolvedValue({
      familyId: "fam-9",
      principalType: "ADMIN",
    });
    const svc = new TokenService(prisma as any, makeJwt() as any, makeConfig());

    await svc.revokeFamilyByToken("admin-token", "MERCHANT");

    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
