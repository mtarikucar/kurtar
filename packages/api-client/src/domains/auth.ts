import type { RequestEngine } from "../engine";
import type { RequestBody } from "../core-types";
import type { AuthTokens, ClientTransport } from "../transport";

/**
 * See transport.ts's `AuthTokens` doc comment: these four operations have
 * no declared OpenAPI response schema, so this is the one deliberate,
 * documented cast in this package — read from the real
 * `TokenService.IssuedTokens` interface, not guessed.
 */
function asAuthTokens(value: unknown): AuthTokens {
  return value as AuthTokens;
}

export function createAuthDomain(
  engine: RequestEngine,
  transport: ClientTransport,
) {
  // Sent on every auth-issuing call when this client was configured for
  // cookie transport (web panels) — see engine.ts's RequestOptions doc.
  const cookieTransportHeader = transport === "cookie";

  return {
    /** POST /auth/otp/request — consumer phone-OTP flow, step 1. Throttled 3/min per phone on the backend. */
    requestOtp: (body: RequestBody<"/api/auth/otp/request", "post">) =>
      engine.request("post", "/api/auth/otp/request", { body }),

    /** POST /auth/otp/verify — consumer phone-OTP flow, step 2. Issues a token pair. */
    verifyOtp: async (
      body: RequestBody<"/api/auth/otp/verify", "post">,
    ): Promise<AuthTokens> =>
      asAuthTokens(
        await engine.request("post", "/api/auth/otp/verify", {
          body,
          cookieTransportHeader,
        }),
      ),

    /** POST /auth/merchant/login — merchant email+password login. */
    merchantLogin: async (
      body: RequestBody<"/api/auth/merchant/login", "post">,
    ): Promise<AuthTokens> =>
      asAuthTokens(
        await engine.request("post", "/api/auth/merchant/login", {
          body,
          cookieTransportHeader,
        }),
      ),

    /** POST /auth/admin/login — admin email+password login. */
    adminLogin: async (
      body: RequestBody<"/api/auth/admin/login", "post">,
    ): Promise<AuthTokens> =>
      asAuthTokens(
        await engine.request("post", "/api/auth/admin/login", {
          body,
          cookieTransportHeader,
        }),
      ),

    /**
     * POST /auth/refresh — you normally never call this yourself: every
     * 401 from ANY other call already triggers the engine's single-flight
     * refresh automatically (see engine.ts). Exposed only for the rare
     * manual case (e.g. proactively refreshing on app foreground).
     */
    refresh: async (
      body: RequestBody<"/api/auth/refresh", "post"> = {},
    ): Promise<AuthTokens> =>
      asAuthTokens(
        await engine.request("post", "/api/auth/refresh", {
          body,
          cookieTransportHeader,
        }),
      ),

    /** POST /auth/logout — revokes the presented refresh token's whole family. */
    logout: (body: RequestBody<"/api/auth/logout", "post"> = {}) =>
      engine.request("post", "/api/auth/logout", {
        body,
        cookieTransportHeader,
      }),
  };
}

export type AuthDomain = ReturnType<typeof createAuthDomain>;
