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

describe("AuthController — initial-issuance transport (otp/verify, merchant/admin login)", () => {
  it.each([
    [
      "verifyOtp",
      (c: AuthController, req: Request, res: Response) =>
        c.verifyOtp({ phone: "+905551234567", code: "123456" }, req, res),
    ],
    [
      "merchantLogin",
      (c: AuthController, req: Request, res: Response) =>
        c.merchantLogin({ email: "a@b.com", password: "pw" }, req, res),
    ],
    [
      "adminLogin",
      (c: AuthController, req: Request, res: Response) =>
        c.adminLogin({ email: "a@b.com", password: "pw" }, req, res),
    ],
  ] as const)(
    "%s: includes refreshToken in the body by default (no transport header — mobile)",
    async (_name, invoke) => {
      const { controller } = makeController();
      const res = makeRes();
      const result = await invoke(controller, makeReq(), res);

      expect(result).toHaveProperty("refreshToken", "refresh-token-x");
      expect(res.cookie).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      "verifyOtp",
      (c: AuthController, req: Request, res: Response) =>
        c.verifyOtp({ phone: "+905551234567", code: "123456" }, req, res),
    ],
    [
      "merchantLogin",
      (c: AuthController, req: Request, res: Response) =>
        c.merchantLogin({ email: "a@b.com", password: "pw" }, req, res),
    ],
    [
      "adminLogin",
      (c: AuthController, req: Request, res: Response) =>
        c.adminLogin({ email: "a@b.com", password: "pw" }, req, res),
    ],
  ] as const)(
    "%s: strips refreshToken from the body when X-Client-Transport: cookie is declared — Critical/Important fix",
    async (_name, invoke) => {
      const { controller } = makeController();
      const res = makeRes();
      const req = makeReq({ headers: { "x-client-transport": "cookie" } });
      const result = await invoke(controller, req, res);

      expect(result).not.toHaveProperty("refreshToken");
      expect(res.cookie).toHaveBeenCalledTimes(1);
      // The cookie itself still carries the fresh token — only the
      // JS-readable JSON body is stripped.
      expect(res.cookie).toHaveBeenCalledWith(
        "refreshToken",
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

describe("AuthController.refresh — cookie/body precedence and strip behavior", () => {
  it("prefers the cookie token over a body token when both are presented", async () => {
    const { controller, tokenService } = makeController();
    const req = makeReq({ cookies: { refreshToken: "cookie-tok" } });
    await controller.refresh(req, { refreshToken: "body-tok" }, makeRes());

    expect(tokenService.refresh).toHaveBeenCalledWith("cookie-tok");
  });

  it("falls back to the body token when no cookie is presented", async () => {
    const { controller, tokenService } = makeController();
    const req = makeReq();
    await controller.refresh(req, { refreshToken: "body-tok" }, makeRes());

    expect(tokenService.refresh).toHaveBeenCalledWith("body-tok");
  });

  it("throws Missing refresh token when neither cookie nor body token is presented", async () => {
    const { controller } = makeController();
    await expect(
      controller.refresh(makeReq(), {}, makeRes()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("strips the body refreshToken when a cookie was actually presented (even with no header)", async () => {
    const { controller } = makeController();
    const req = makeReq({ cookies: { refreshToken: "cookie-tok" } });
    const result = await controller.refresh(req, {}, makeRes());

    expect(result).not.toHaveProperty("refreshToken");
  });

  it("strips the body refreshToken when the header declares cookie transport, even without a cookie this call", async () => {
    const { controller } = makeController();
    const req = makeReq({
      headers: { "x-client-transport": "cookie" },
    });
    const result = await controller.refresh(
      req,
      { refreshToken: "body-tok" },
      makeRes(),
    );

    expect(result).not.toHaveProperty("refreshToken");
  });

  it("includes the body refreshToken when neither the header nor a cookie is present (mobile default)", async () => {
    const { controller } = makeController();
    const req = makeReq();
    const result = await controller.refresh(
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

  it("sets httpOnly, sameSite=strict, path=/api/auth, and secure=false outside production", async () => {
    process.env.NODE_ENV = "development";
    const { controller } = makeController();
    const res = makeRes();
    await controller.verifyOtp(
      { phone: "+905551234567", code: "123456" },
      makeReq(),
      res,
    );

    expect(res.cookie).toHaveBeenCalledWith("refreshToken", "refresh-token-x", {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/api/auth",
      expires: expect.any(Date),
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
      "refreshToken",
      "refresh-token-x",
      expect.objectContaining({ secure: true }),
    );
  });
});

describe("AuthController.logout — precedence and cookie clearing", () => {
  it("revokes the cookie token over a body token when both are presented", async () => {
    const { controller, tokenService } = makeController();
    const req = makeReq({ cookies: { refreshToken: "cookie-tok" } });
    await controller.logout(req, { refreshToken: "body-tok" }, makeRes());

    expect(tokenService.revokeFamilyByToken).toHaveBeenCalledWith("cookie-tok");
  });

  it("falls back to the body token when no cookie is presented", async () => {
    const { controller, tokenService } = makeController();
    await controller.logout(makeReq(), { refreshToken: "body-tok" }, makeRes());

    expect(tokenService.revokeFamilyByToken).toHaveBeenCalledWith("body-tok");
  });

  it("no-ops the revoke call when neither is presented, but still clears the cookie", async () => {
    const { controller, tokenService } = makeController();
    const res = makeRes();
    const result = await controller.logout(makeReq(), {}, res);

    expect(tokenService.revokeFamilyByToken).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith("refreshToken", {
      path: "/api/auth",
    });
    expect(result).toEqual({ success: true });
  });
});
