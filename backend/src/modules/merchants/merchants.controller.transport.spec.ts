import { Request, Response } from "express";
import { MerchantsController } from "./merchants.controller";

/**
 * [Security fix] Mirrors auth.controller.transport.spec.ts's
 * "initial-issuance transport" coverage for MerchantsController.signup —
 * the second endpoint that mints a fresh token pair in a
 * browser-reachable response, now routed through the SAME
 * respondWithTokens()/wantsCookieOnlyTransport() convention as
 * /auth/otp/verify and /auth/*​/login (refresh-cookie-transport.util.ts).
 * Exists so this specific endpoint can never again silently regress back
 * to always including the refresh token in JS-readable JSON — the exact
 * class of bug this fix closes.
 */

function sampleSignupResult() {
  return {
    accessToken: "access-token-x",
    refreshToken: "refresh-token-x",
    refreshTokenExpiresAt: new Date(Date.now() + 60_000),
    merchant: { id: "m1", verificationStatus: "DRAFT" },
  };
}

function makeReq(opts: { headers?: Record<string, string> } = {}): Request {
  const headers = opts.headers ?? {};
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function makeRes(): Response & { cookie: jest.Mock; clearCookie: jest.Mock } {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response & { cookie: jest.Mock; clearCookie: jest.Mock };
}

function makeController() {
  const merchants = {
    signup: jest.fn().mockResolvedValue(sampleSignupResult()),
  };
  return { controller: new MerchantsController(merchants as never), merchants };
}

describe("MerchantsController.signup — transport (mirrors AuthController)", () => {
  it("includes refreshToken in the body by default (no transport header — mobile/curl)", async () => {
    const { controller } = makeController();
    const res = makeRes();
    const result = await controller.signup({} as never, makeReq(), res);

    expect(result).toHaveProperty("refreshToken", "refresh-token-x");
    expect(res.cookie).toHaveBeenCalledTimes(1);
  });

  it("strips refreshToken from the body when X-Client-Transport: cookie is declared", async () => {
    const { controller } = makeController();
    const res = makeRes();
    const req = makeReq({ headers: { "x-client-transport": "cookie" } });
    const result = await controller.signup({} as never, req, res);

    expect(result).not.toHaveProperty("refreshToken");
    expect(res.cookie).toHaveBeenCalledTimes(1);
    // The cookie itself still carries the fresh token — only the
    // JS-readable JSON body is stripped.
    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken_merchant",
      "refresh-token-x",
      expect.any(Object),
    );
  });

  it("header value is case-insensitive", async () => {
    const { controller } = makeController();
    const res = makeRes();
    const req = makeReq({ headers: { "x-client-transport": "COOKIE" } });
    const result = await controller.signup({} as never, req, res);

    expect(result).not.toHaveProperty("refreshToken");
  });

  it("still returns the rest of the body (accessToken, merchant) when stripped", async () => {
    const { controller } = makeController();
    const req = makeReq({ headers: { "x-client-transport": "cookie" } });
    const result = await controller.signup({} as never, req, makeRes());

    expect(result).toMatchObject({
      accessToken: "access-token-x",
      merchant: { id: "m1", verificationStatus: "DRAFT" },
    });
  });

  describe("cookie attributes", () => {
    const originalEnv = process.env.NODE_ENV;
    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it("sets httpOnly, sameSite=strict, the MERCHANT actor's path, and secure=false outside production", async () => {
      process.env.NODE_ENV = "development";
      const { controller } = makeController();
      const res = makeRes();
      await controller.signup({} as never, makeReq(), res);

      expect(res.cookie).toHaveBeenCalledWith(
        "refreshToken_merchant",
        "refresh-token-x",
        {
          httpOnly: true,
          secure: false,
          sameSite: "strict",
          // Signup mints a MERCHANT session, so its cookie carries the
          // merchant actor's own path even though this route lives
          // outside /api/auth — see refresh-cookie-transport.util.ts.
          path: "/api/auth/merchant",
          expires: expect.any(Date),
        },
      );
    });

    it("sets secure=true in production", async () => {
      process.env.NODE_ENV = "production";
      const { controller } = makeController();
      const res = makeRes();
      await controller.signup({} as never, makeReq(), res);

      expect(res.cookie).toHaveBeenCalledWith(
        "refreshToken_merchant",
        "refresh-token-x",
        expect.objectContaining({ secure: true }),
      );
    });
  });
});
