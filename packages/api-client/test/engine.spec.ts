import { createRequestEngine } from "../src/engine";
import { KurtarApiError } from "../src/errors";

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("createRequestEngine — happy path", () => {
  it("resolves with the parsed JSON body on a 2xx response", async () => {
    const fetchMock = jest.fn(async (url: string) => {
      expect(url).toBe("http://api.test/api/health");
      return jsonResponse(200, { status: "ok" });
    });
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await engine.request("get", "/api/health");
    expect(result).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("attaches the Authorization header when an access token is present", async () => {
    let capturedHeaders: Headers | undefined;
    const fetchMock = jest.fn(async (_url: string, init: RequestInit = {}) => {
      capturedHeaders = new Headers(init.headers);
      return jsonResponse(200, { ok: true });
    });
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => "token-123",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await engine.request("get", "/api/merchants/me");
    expect(capturedHeaders?.get("authorization")).toBe("Bearer token-123");
  });

  it("substitutes path params and serializes query params", async () => {
    const fetchMock = jest.fn(async (url: string) => {
      expect(url).toBe(
        "http://api.test/api/discovery/offers?lat=41.02&lng=28.97&radiusM=1500&page=1&pageSize=20",
      );
      return jsonResponse(200, { items: [], total: 0 });
    });
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await engine.request("get", "/api/discovery/offers", {
      query: { lat: 41.02, lng: 28.97, radiusM: 1500, page: 1, pageSize: 20 },
    });
  });

  it("substitutes a path parameter for a mutating call", async () => {
    const fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
      expect(url).toBe("http://api.test/api/offers/offer-42/publish");
      expect(init.method).toBe("POST");
      return jsonResponse(201, undefined);
    });
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => "t",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await engine.request("post", "/api/offers/{id}/publish", {
      path: { id: "offer-42" },
    });
  });
});

describe("createRequestEngine — error envelope mapping", () => {
  it("throws a KurtarApiError with the backend's errorCode preserved", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(409, {
        statusCode: 409,
        errorCode: "OFFER_UNAVAILABLE",
        message: "This offer no longer has bags available.",
      }),
    );
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => "t",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      engine.request("get", "/api/merchants/me"),
    ).rejects.toMatchObject({
      errorCode: "OFFER_UNAVAILABLE",
      statusCode: 409,
      message: "This offer no longer has bags available.",
    });
  });

  it("rejects with an instance of KurtarApiError (not a plain object)", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(404, {
        statusCode: 404,
        errorCode: "OFFER_NOT_FOUND",
        message: "Offer not found.",
      }),
    );
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => "t",
      fetch: fetchMock as unknown as typeof fetch,
    });

    let caught: unknown;
    try {
      await engine.request("get", "/api/merchants/me");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(KurtarApiError);
  });
});

describe("createRequestEngine — single-flight refresh", () => {
  it("collapses N concurrent 401s into exactly ONE refresh call, and retries all N successfully", async () => {
    let currentAccessToken = "expired-token";
    let refreshCallCount = 0;
    let protectedCallCount = 0;

    const fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith("/api/auth/refresh")) {
        refreshCallCount += 1;
        return jsonResponse(200, {
          accessToken: "fresh-token",
          refreshToken: "fresh-refresh-token",
          refreshTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (url.endsWith("/api/reservations/mine")) {
        protectedCallCount += 1;
        const headers = new Headers(init.headers);
        if (headers.get("authorization") === "Bearer fresh-token") {
          return jsonResponse(200, { items: [] });
        }
        return jsonResponse(401, {
          statusCode: 401,
          message: "jwt expired",
          error: "Unauthorized",
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => currentAccessToken,
      getRefreshToken: () => "stale-refresh-token",
      onTokensIssued: (tokens) => {
        currentAccessToken = tokens.accessToken;
      },
      fetch: fetchMock as unknown as typeof fetch,
    });

    const CONCURRENCY = 5;
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        engine.request("get", "/api/reservations/mine"),
      ),
    );

    expect(results).toHaveLength(CONCURRENCY);
    for (const result of results) {
      expect(result).toEqual({ items: [] });
    }

    // The load-bearing assertion: N concurrent 401s must trigger exactly
    // ONE refresh call. A naive client that fired one refresh per 401
    // would show refreshCallCount === CONCURRENCY here instead, and would
    // have logged the user out for real against the actual backend (see
    // engine.ts's class doc for why: reuse of an already-rotated refresh
    // token revokes the whole token family).
    expect(refreshCallCount).toBe(1);

    // Every one of the N original calls got its 401, then retried exactly
    // once after the single refresh resolved: N initial 401s + N retries.
    expect(protectedCallCount).toBe(CONCURRENCY * 2);
    expect(fetchMock).toHaveBeenCalledTimes(CONCURRENCY * 2 + 1);
  });

  it("calls onTokensIssued exactly once and retries with the NEW token, not a stale getAccessToken() read", async () => {
    // Deliberately never updates currentAccessToken via onTokensIssued —
    // proves the retry uses the token value the refresh call itself
    // returned, not a second call to getAccessToken() (which could race a
    // caller's async state update, e.g. React's setState).
    const fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith("/api/auth/refresh")) {
        return jsonResponse(200, {
          accessToken: "fresh-token",
          refreshToken: "r",
        });
      }
      const headers = new Headers(init.headers);
      if (headers.get("authorization") === "Bearer fresh-token") {
        return jsonResponse(200, { ok: true });
      }
      return jsonResponse(401, {
        statusCode: 401,
        message: "expired",
        error: "Unauthorized",
      });
    });
    const onTokensIssued = jest.fn();
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => "stale-token-never-updated",
      onTokensIssued,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await engine.request("get", "/api/merchants/me");
    expect(result).toEqual({ ok: true });
    expect(onTokensIssued).toHaveBeenCalledTimes(1);
    expect(onTokensIssued).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "fresh-token" }),
    );
  });

  it("fires onUnauthorized exactly once and rejects every waiting caller when the refresh call itself fails", async () => {
    let refreshCallCount = 0;
    const onUnauthorized = jest.fn();
    const fetchMock = jest.fn(async (url: string) => {
      if (url.endsWith("/api/auth/refresh")) {
        refreshCallCount += 1;
        return jsonResponse(401, {
          statusCode: 401,
          errorCode: "REFRESH_TOKEN_INVALID",
          message: "Invalid refresh token",
        });
      }
      return jsonResponse(401, {
        statusCode: 401,
        message: "jwt expired",
        error: "Unauthorized",
      });
    });
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => "expired-token",
      onUnauthorized,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const CONCURRENCY = 3;
    const outcomes = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () =>
        engine.request("get", "/api/reservations/mine"),
      ),
    );

    expect(outcomes.every((o) => o.status === "rejected")).toBe(true);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        expect(outcome.reason).toBeInstanceOf(KurtarApiError);
        expect((outcome.reason as KurtarApiError).errorCode).toBe(
          "REFRESH_TOKEN_INVALID",
        );
      }
    }
    expect(refreshCallCount).toBe(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("performs a NEW single-flight refresh for a later 401 after a prior refresh already completed (memo is not a permanent lock)", async () => {
    let refreshCallCount = 0;
    let currentAccessToken = "expired-1";
    const fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith("/api/auth/refresh")) {
        refreshCallCount += 1;
        return jsonResponse(200, {
          accessToken: `fresh-${refreshCallCount}`,
          refreshToken: "r",
        });
      }
      const headers = new Headers(init.headers);
      const auth = headers.get("authorization");
      if (auth === `Bearer fresh-${refreshCallCount}`) {
        return jsonResponse(200, { ok: true });
      }
      return jsonResponse(401, {
        statusCode: 401,
        message: "expired",
        error: "Unauthorized",
      });
    });
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => currentAccessToken,
      onTokensIssued: (tokens) => {
        currentAccessToken = tokens.accessToken;
      },
      fetch: fetchMock as unknown as typeof fetch,
    });

    await engine.request("get", "/api/merchants/me");
    expect(refreshCallCount).toBe(1);

    // Token goes stale again later (e.g. its 15m TTL elapsed) — a fresh,
    // independent single-flight refresh must be possible, not blocked by
    // the first attempt's now-resolved memo.
    currentAccessToken = "expired-2";
    await engine.request("get", "/api/merchants/me");
    expect(refreshCallCount).toBe(2);
  });
});

describe("createRequestEngine — transport header behavior", () => {
  it("cookie transport: sends X-Client-Transport: cookie and credentials:'include' when flagged", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = jest.fn(async (_url: string, init: RequestInit = {}) => {
      capturedInit = init;
      return jsonResponse(200, { accessToken: "a" });
    });
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "cookie",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await engine.request("post", "/api/auth/otp/verify", {
      body: { phone: "+905551234567", code: "123456" },
      cookieTransportHeader: true,
    });

    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("x-client-transport")).toBe("cookie");
    expect(capturedInit?.credentials).toBe("include");
  });

  it("body transport: never sends X-Client-Transport, even when the caller flags cookieTransportHeader", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = jest.fn(async (_url: string, init: RequestInit = {}) => {
      capturedInit = init;
      return jsonResponse(200, { accessToken: "a" });
    });
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await engine.request("post", "/api/auth/otp/verify", {
      body: { phone: "+905551234567", code: "123456" },
      cookieTransportHeader: true,
    });

    const headers = new Headers(capturedInit?.headers);
    expect(headers.has("x-client-transport")).toBe(false);
    expect(capturedInit?.credentials).toBe("omit");
  });

  it("never sends X-Client-Transport on a regular call that doesn't opt in, even under cookie transport", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = jest.fn(async (_url: string, init: RequestInit = {}) => {
      capturedInit = init;
      return jsonResponse(200, { items: [] });
    });
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "cookie",
      getAccessToken: () => "t",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await engine.request("get", "/api/offers/mine");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.has("x-client-transport")).toBe(false);
  });
});

describe("createRequestEngine — network failure", () => {
  it("maps a rejected fetch (offline/DNS/timeout) to a NETWORK_ERROR KurtarApiError", async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const engine = createRequestEngine({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(engine.request("get", "/api/health")).rejects.toMatchObject({
      errorCode: "NETWORK_ERROR",
      statusCode: 0,
    });
  });
});
