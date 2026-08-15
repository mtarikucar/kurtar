import { Request, Response } from "express";
import { UnauthorizedException } from "@nestjs/common";
import { AuthController } from "./auth.controller";

/**
 * Dual-transport handler coverage — Important finding: this behavior
 * (cookie-vs-body precedence, when the refresh token is/isn't stripped
 * from the JSON body, and the exact cookie attribute set) previously had
 * zero automated coverage; it was verified only by a one-off curl
 * transcript. Exercises AuthController's handlers directly against fake
 * Express Request/Response objects.
 */

function sampleTokens() {
  return {
    accessToken: "access-token-x",
    refreshToken: "refresh-token-x",
    refreshTokenExpiresAt: new Date(Date.now() + 60_000),
  };
}

function sampleAuthResult() {
  return { ...sampleTokens(), user: { id: "u1" } };
}

function makeReq(
  opts: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {},
): Request {
  const headers = opts.headers ?? {};
  return {
    header: (name: string) => headers[name.toLowerCase()],
    cookies: opts.cookies ?? {},
  } as unknown as Request;
}

function makeRes(): Response & { cookie: jest.Mock; clearCookie: jest.Mock } {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response & { cookie: jest.Mock; clearCookie: jest.Mock };
}

function makeController() {
  const authService = {
    requestConsumerOtp: jest.fn(),
    verifyConsumerOtp: jest.fn().mockResolvedValue(sampleAuthResult()),
    merchantLogin: jest.fn().mockResolvedValue(sampleAuthResult()),
    adminLogin: jest.fn().mockResolvedValue(sampleAuthResult()),
  };
  const tokenService = {
    refresh: jest.fn().mockResolvedValue(sampleTokens()),
    revokeFamilyByToken: jest.fn(),
  };
  return {
    controller: new AuthController(authService as never, tokenService as never),
    authService,
    tokenService,
  };
}

/**
 * Every endpoint that mints a brand-new session, paired with the
 * actor-scoped cookie name it must set. Shared by both it.each blocks
 * below so a new issuing endpoint is added in exactly one place.
 */
const ISSUING_CALLS = [
  [
    "verifyOtp",
    (c: AuthController, req: Request, res: Response) =>
      c.verifyOtp({ phone: "+905551234567", code: "123456" }, req, res),
    "refreshToken_consumer",
  ],
  [
    "merchantLogin",
    (c: AuthController, req: Request, res: Response) =>
      c.merchantLogin({ email: "a@b.com", password: "pw" }, req, res),
    "refreshToken_merchant",
  ],
  [
    "adminLogin",
    (c: AuthController, req: Request, res: Response) =>
      c.adminLogin({ email: "a@b.com", password: "pw" }, req, res),
    "refreshToken_admin",
  ],
] as const;

describe("AuthController — initial-issuance transport (otp/verify, merchant/admin login)", () => {
  it.each(ISSUING_CALLS)(
    "%s: includes refreshToken in the body by default (no transport header — mobile)",
    async (_name, invoke, expectedCookie) => {
      const { controller } = makeController();
      const res = makeRes();
      const result = await invoke(controller, makeReq(), res);

      expect(result).toHaveProperty("refreshToken", "refresh-token-x");
      expect(res.cookie).toHaveBeenCalledTimes(1);
      expect(res.cookie).toHaveBeenCalledWith(
        expectedCookie,
        "refresh-token-x",
        expect.any(Object),
      );
    },
  );

  it.each(ISSUING_CALLS)(
    "%s: strips refreshToken from the body when X-Client-Transport: cookie is declared — Critical/Important fix",
    async (_name, invoke, expectedCookie) => {
      const { controller } = makeController();
      const res = makeRes();
      const req = makeReq({ headers: { "x-client-transport": "cookie" } });
      const result = await invoke(controller, req, res);

      expect(result).not.toHaveProperty("refreshToken");
      expect(res.cookie).toHaveBeenCalledTimes(1);
      // The cookie itself still carries the fresh token — only the
      // JS-readable JSON body is stripped. Its NAME is the actor's own
      // (refreshToken_consumer / _merchant / _admin), never the shared
      // pre-fix `refreshToken` — see refresh-cookie-transport.util.ts.
      expect(res.cookie).toHaveBeenCalledWith(
        expectedCookie,
        "refresh-token-x",
        expect.any(Object),
      );
    },
  );

  it("header value is case-insensitive", async () => {
    const { controller } = makeController();
    const res = makeRes();
    const req = makeReq({ headers: { "x-client-transport": "COOKIE" } });
    const result = await controller.verifyOtp(
      { phone: "+905551234567", code: "123456" },
      req,
      res,
    );
    expect(result).not.toHaveProperty("refreshToken");
  });
});

describe("AuthController refresh — cookie/body precedence and strip behavior", () => {
  it("prefers the cookie token over a body token when both are presented", async () => {
    const { controller, tokenService } = makeController();
    const req = makeReq({ cookies: { refreshToken_admin: "cookie-tok" } });
    await controller.refreshAdmin(req, { refreshToken: "body-tok" }, makeRes());

    expect(tokenService.refresh).toHaveBeenCalledWith("cookie-tok", "ADMIN");
  });

  it("falls back to the body token when no cookie is presented", async () => {
    const { controller, tokenService } = makeController();
    const req = makeReq();
    await controller.refreshConsumer(
      req,
      { refreshToken: "body-tok" },
      makeRes(),
    );

    expect(tokenService.refresh).toHaveBeenCalledWith("body-tok", "CONSUMER");
  });

  // The heart of the cross-actor session-bleed fix at the controller
  // layer: even if a browser DOES present another actor's cookie (a
  // pre-fix cookie jar, a hand-crafted request), this route never reads
  // it — it looks up its OWN actor's cookie name and nothing else.
  it("ignores another actor's refresh cookie entirely", async () => {
    const { controller, tokenService } = makeController();
    const req = makeReq({
      cookies: {
        refreshToken_merchant: "merchant-tok",
        refreshToken: "legacy-unscoped-tok",
      },
    });
    await expect(
      controller.refreshAdmin(req, {}, makeRes()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenService.refresh).not.toHaveBeenCalled();
  });

  it("throws Missing refresh token when neither cookie nor body token is presented", async () => {
    const { controller } = makeController();
    await expect(
      controller.refreshMerchant(makeReq(), {}, makeRes()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("strips the body refreshToken when a cookie was actually presented (even with no header)", async () => {
    const { controller } = makeController();
    const req = makeReq({ cookies: { refreshToken_merchant: "cookie-tok" } });
    const result = await controller.refreshMerchant(req, {}, makeRes());

    expect(result).not.toHaveProperty("refreshToken");
  });

  it("strips the body refreshToken when the header declares cookie transport, even without a cookie this call", async () => {
    const { controller } = makeController();
    const req = makeReq({
      headers: { "x-client-transport": "cookie" },
    });
    const result = await controller.refreshMerchant(
      req,
      { refreshToken: "body-tok" },
      makeRes(),
    );

    expect(result).not.toHaveProperty("refreshToken");
  });

  it("includes the body refreshToken when neither the header nor a cookie is present (mobile default)", async () => {
    const { controller } = makeController();
    const req = makeReq();
    const result = await controller.refreshConsumer(
      req,
      { refreshToken: "body-tok" },
      makeRes(),
    );

    expect(result).toHaveProperty("refreshToken", "refresh-token-x");
  });
});

describe("AuthController — refresh cookie attributes", () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("sets httpOnly, sameSite=strict, the ACTOR's own path, and secure=false outside production", async () => {
    process.env.NODE_ENV = "development";
    const { controller } = makeController();
    const res = makeRes();
    await controller.verifyOtp(
      { phone: "+905551234567", code: "123456" },
      makeReq(),
      res,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken_consumer",
      "refresh-token-x",
      {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        // NOT "/api/auth": a path that matches every actor's refresh
        // route is what let one surface's JS reach another actor's
        // cookie in the first place.
        path: "/api/auth/consumer",
        expires: expect.any(Date),
      },
    );
  });

  it("scopes the admin cookie to the admin path, not a shared one", async () => {
    process.env.NODE_ENV = "development";
    const { controller } = makeController();
    const res = makeRes();
    await controller.adminLogin(
      { email: "a@b.com", password: "pw" },
      makeReq(),
      res,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken_admin",
      "refresh-token-x",
      expect.objectContaining({ path: "/api/auth/admin" }),
    );
  });

  it("clears any leftover pre-fix unscoped cookie whenever it sets a scoped one", async () => {
    const { controller } = makeController();
    const res = makeRes();
    await controller.merchantLogin(
      { email: "a@b.com", password: "pw" },
      makeReq(),
      res,
    );

    expect(res.clearCookie).toHaveBeenCalledWith("refreshToken", {
      path: "/api/auth",
    });
  });

  it("sets secure=true in production", async () => {
    process.env.NODE_ENV = "production";
    const { controller } = makeController();
    const res = makeRes();
    await controller.verifyOtp(
      { phone: "+905551234567", code: "123456" },
      makeReq(),
      res,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken_consumer",
      "refresh-token-x",
      expect.objectContaining({ secure: true }),
    );
  });
});

describe("AuthController logout — precedence and cookie clearing", () => {
  it("revokes the cookie token over a body token when both are presented", async () => {
    const { controller, tokenService } = makeController();
    const req = makeReq({ cookies: { refreshToken_merchant: "cookie-tok" } });
    await controller.logoutMerchant(
      req,
      { refreshToken: "body-tok" },
      makeRes(),
    );

    expect(tokenService.revokeFamilyByToken).toHaveBeenCalledWith(
      "cookie-tok",
      "MERCHANT",
    );
  });

  it("falls back to the body token when no cookie is presented", async () => {
    const { controller, tokenService } = makeController();
    await controller.logoutConsumer(
      makeReq(),
      { refreshToken: "body-tok" },
      makeRes(),
    );

    expect(tokenService.revokeFamilyByToken).toHaveBeenCalledWith(
      "body-tok",
      "CONSUMER",
    );
  });

  it("never revokes off another actor's cookie", async () => {
    const { controller, tokenService } = makeController();
    const req = makeReq({ cookies: { refreshToken_admin: "admin-tok" } });
    await controller.logoutMerchant(req, {}, makeRes());

    expect(tokenService.revokeFamilyByToken).not.toHaveBeenCalled();
  });

  it("no-ops the revoke call when neither is presented, but still clears the actor's cookie", async () => {
    const { controller, tokenService } = makeController();
    const res = makeRes();
    const result = await controller.logoutAdmin(makeReq(), {}, res);

    expect(tokenService.revokeFamilyByToken).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith("refreshToken_admin", {
      path: "/api/auth/admin",
    });
    expect(result).toEqual({ success: true });
  });
});
