import { createClient } from "../src/client";

/**
 * Regression test for bug #1: `merchant.signup()` minting a full session
 * (a token pair) without declaring cookie transport. The backend
 * (commit 7eb1bc2) routes POST /merchants/signup through the SAME
 * respondWithTokens()/wantsCookieOnlyTransport() convention every other
 * auth-issuing endpoint uses — setting the httpOnly cookie and stripping
 * the refresh token from the JSON body ONLY when the caller sends
 * `X-Client-Transport: cookie`. A client that never sends that header on
 * signup gets the 30-day refresh token back in JS-readable JSON
 * regardless of transport, which is exactly the exposure the backend fix
 * was meant to close — silently inert on the client side without this.
 */

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

const SIGNUP_BODY = {
  legalName: "Test İşletme A.Ş.",
  tradeName: "Test İşletme",
  taxId: "1234567890",
  iban: "TR330006100519786457841326",
  email: "owner@example.com",
  password: "hunter2hunter2",
  ownerName: "Test Owner",
};

describe("merchant.signup() transport header", () => {
  it("cookie transport: sends X-Client-Transport: cookie and credentials:'include', same as every other session-minting call", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = jest.fn(async (_url: string, init: RequestInit = {}) => {
      capturedInit = init;
      return jsonResponse({
        accessToken: "a",
        merchant: { id: "m1", verificationStatus: "DRAFT" },
      });
    });
    const client = createClient({
      baseUrl: "http://api.test",
      transport: "cookie",
      actor: "MERCHANT",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.merchant.signup(SIGNUP_BODY);

    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("x-client-transport")).toBe("cookie");
    expect(capturedInit?.credentials).toBe("include");
  });

  it("body transport: never sends X-Client-Transport (the Expo app has no meaningful cookie jar)", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = jest.fn(async (_url: string, init: RequestInit = {}) => {
      capturedInit = init;
      return jsonResponse({
        accessToken: "a",
        refreshToken: "r",
        merchant: { id: "m1", verificationStatus: "DRAFT" },
      });
    });
    const client = createClient({
      baseUrl: "http://api.test",
      transport: "body",
      actor: "MERCHANT",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.merchant.signup(SIGNUP_BODY);

    const headers = new Headers(capturedInit?.headers);
    expect(headers.has("x-client-transport")).toBe(false);
    expect(capturedInit?.credentials).toBe("omit");
  });

  it("signup response is typed as the real MerchantSignupResponseDto, not the generic AuthTokens shape (the `merchant` field survives)", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        accessToken: "a",
        refreshToken: "r",
        refreshTokenExpiresAt: "2026-09-01T00:00:00.000Z",
        merchant: { id: "m1", verificationStatus: "DRAFT" },
      }),
    );
    const client = createClient({
      baseUrl: "http://api.test",
      transport: "body",
      actor: "MERCHANT",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.merchant.signup(SIGNUP_BODY);
    expect(result.merchant.id).toBe("m1");
    expect(result.merchant.verificationStatus).toBe("DRAFT");
    expect(result.accessToken).toBe("a");
  });
});
