import { PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { Request, Response } from "express";
import { TokenService } from "./services/token.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * The cross-actor session-bleed regression gate, against a REAL database:
 * a refresh token minted for one actor must never mint a session for
 * another, no matter how it is presented.
 *
 * Before this, one unscoped `refreshToken` cookie at path `/api/auth`
 * served all three actors on one shared backend origin, so whichever
 * actor signed in last owned the browser's only session — and any script
 * on any same-site surface could trade that cookie for an access token
 * belonging to whoever that happened to be. See
 * refresh-cookie-transport.util.ts's ACTOR SCOPING note for the full
 * write-up.
 *
 * Real rows, real principalType, real rotation — not mocks: the mocked
 * unit spec (services/token.service.spec.ts) can only prove the branch is
 * taken, while this proves the actual persisted token of a real merchant,
 * presented on the real admin route, yields a 401 and nothing else.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

function makeReq(cookies: Record<string, string>): Request {
  return {
    header: () => undefined,
    cookies,
  } as unknown as Request;
}

function makeRes(): Response {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;
}

d("refresh tokens are bound to their actor (cross-actor session bleed)", () => {
  let prisma: PrismaClient;
  let tokenService: TokenService;
  let controller: AuthController;
  let merchantId: string;
  let merchantUserId: string;
  let adminUserId: string;

  const suffix = Date.now().toString().slice(-9);

  const config = {
    get: (key: string) =>
      ({
        JWT_SECRET: "realdb-actor-binding-secret",
        JWT_EXPIRES_IN: "15m",
        JWT_REFRESH_EXPIRES_IN: "30d",
      })[key],
  } as unknown as ConfigService;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    const jwtService = new JwtService({
      secret: "realdb-actor-binding-secret",
    });
    tokenService = new TokenService(
      prisma as unknown as PrismaService,
      jwtService,
      config,
    );
    // The real controller over the real TokenService — the AuthService
    // half is never reached by refresh/logout, so a bare stub is honest
    // here rather than a second mock of behaviour under test.
    controller = new AuthController({} as unknown as AuthService, tokenService);

    const merchant = await prisma.merchant.create({
      data: {
        legalName: `Actor Binding Test ${suffix} Ltd`,
        tradeName: `Actor Binding Test ${suffix}`,
        taxId: `9${suffix}`,
        iban: `TR33000610051978645784${suffix.slice(-4)}`,
      },
    });
    merchantId = merchant.id;
    const merchantUser = await prisma.merchantUser.create({
      data: {
        merchantId,
        email: `actor-binding-${suffix}@test.invalid`,
        name: "Actor Binding Owner",
        passwordHash: "not-a-real-hash",
      },
    });
    merchantUserId = merchantUser.id;
    const adminUser = await prisma.adminUser.create({
      data: {
        email: `actor-binding-admin-${suffix}@test.invalid`,
        name: "Actor Binding Admin",
        passwordHash: "not-a-real-hash",
      },
    });
    adminUserId = adminUser.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.refreshToken
      .deleteMany({ where: { OR: [{ merchantUserId }, { adminUserId }] } })
      .catch(() => {});
    await prisma.merchantUser
      .deleteMany({ where: { merchantId } })
      .catch(() => {});
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {});
    await prisma.adminUser
      .delete({ where: { id: adminUserId } })
      .catch(() => {});
    await prisma.$disconnect();
  });

  async function mintMerchantToken(): Promise<string> {
    const issued = await tokenService.issueTokens({
      id: merchantUserId,
      actor: "MERCHANT",
      merchantId,
      role: "OWNER",
    });
    return issued.refreshToken;
  }

  it("a real merchant's refresh token cannot mint an ADMIN session", async () => {
    const merchantRefreshToken = await mintMerchantToken();

    await expect(
      tokenService.refresh(merchantRefreshToken, "ADMIN"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("the merchant's own session survives that attempt (no family revoke)", async () => {
    const merchantRefreshToken = await mintMerchantToken();

    await expect(
      tokenService.refresh(merchantRefreshToken, "ADMIN"),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Still perfectly usable on its OWN route: rejecting the misuse must
    // not become a way for any surface to log a merchant out.
    const rotated = await tokenService.refresh(
      merchantRefreshToken,
      "MERCHANT",
    );
    expect(rotated.accessToken).toBeTruthy();
  });

  it("POST /auth/admin/refresh does not even read the merchant cookie", async () => {
    const merchantRefreshToken = await mintMerchantToken();

    // A browser that still carries BOTH a merchant cookie and a leftover
    // pre-fix unscoped one — the exact jar the old single-cookie design
    // produced. The admin route must find nothing it is willing to use.
    const req = makeReq({
      refreshToken_merchant: merchantRefreshToken,
      refreshToken: merchantRefreshToken,
    });

    await expect(
      controller.refreshAdmin(req, {}, makeRes()),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // ...and the merchant token is untouched by the attempt.
    const rotated = await tokenService.refresh(
      merchantRefreshToken,
      "MERCHANT",
    );
    expect(rotated.accessToken).toBeTruthy();
  });

  it("logging out of the merchant surface never revokes the admin's family", async () => {
    const adminIssued = await tokenService.issueTokens({
      id: adminUserId,
      actor: "ADMIN",
    });

    // Present the admin's token on the MERCHANT logout route (body
    // transport, the most permissive way to get it there at all).
    await controller.logoutMerchant(
      makeReq({}),
      { refreshToken: adminIssued.refreshToken },
      makeRes(),
    );

    const stillValid = await tokenService.refresh(
      adminIssued.refreshToken,
      "ADMIN",
    );
    expect(stillValid.accessToken).toBeTruthy();
  });
});
