import type { RequestEngine } from "../engine";
import type { RequestBody } from "../core-types";
import type { ClientActor, ClientTransport } from "../transport";

/** Every actor's refresh/logout route shares one body shape; pick any one as the alias. */
type RefreshBody = RequestBody<"/api/auth/admin/refresh", "post">;
type LogoutBody = RequestBody<"/api/auth/admin/logout", "post">;

export function createAuthDomain(
  engine: RequestEngine,
  transport: ClientTransport,
  actor: ClientActor,
) {
  // Sent on every auth-issuing call when this client was configured for
  // cookie transport (web panels) — see engine.ts's RequestOptions doc.
  const cookieTransportHeader = transport === "cookie";

  return {
    /** POST /auth/otp/request — consumer phone-OTP flow, step 1. Throttled 3/min per phone on the backend. */
    requestOtp: (body: RequestBody<"/api/auth/otp/request", "post">) =>
      engine.request("post", "/api/auth/otp/request", { body }),

    /** POST /auth/otp/verify — consumer phone-OTP flow, step 2. Issues a token pair + the consumer's own profile. */
    verifyOtp: (body: RequestBody<"/api/auth/otp/verify", "post">) =>
      engine.request("post", "/api/auth/otp/verify", {
        body,
        cookieTransportHeader,
      }),

    /** POST /auth/merchant/login — merchant email+password login. Issues a token pair + the merchant user's own profile (id/email/role/merchantId). */
    merchantLogin: (body: RequestBody<"/api/auth/merchant/login", "post">) =>
      engine.request("post", "/api/auth/merchant/login", {
        body,
        cookieTransportHeader,
      }),

    /** POST /auth/admin/login — admin email+password login. Issues a token pair + the admin user's own profile. */
    adminLogin: (body: RequestBody<"/api/auth/admin/login", "post">) =>
      engine.request("post", "/api/auth/admin/login", {
        body,
        cookieTransportHeader,
      }),

    /**
     * POST /auth/<actor>/refresh — you normally never call this yourself:
     * every 401 from ANY other call already triggers the engine's
     * single-flight refresh automatically (see engine.ts). Exposed only
     * for the rare manual case (proactively refreshing on app foreground,
     * or restoring a session on page load).
     *
     * Routed to THIS client's own actor. There is no shared
     * `/api/auth/refresh` any more — see `ClientActor` in transport.ts for
     * the cross-actor session bleed that removed it.
     */
    refresh: (body: RefreshBody = {}) => {
      switch (actor) {
        case "ADMIN":
          return engine.request("post", "/api/auth/admin/refresh", {
            body,
            cookieTransportHeader,
          });
        case "MERCHANT":
          return engine.request("post", "/api/auth/merchant/refresh", {
            body,
            cookieTransportHeader,
          });
        default:
          return engine.request("post", "/api/auth/consumer/refresh", {
            body,
            cookieTransportHeader,
          });
      }
    },

    /**
     * POST /auth/<actor>/logout — revokes the presented refresh token's
     * whole family, for THIS client's actor only. A token belonging to a
     * different actor is a no-op (the backend checks), so one surface's
     * logout can never end another actor's session.
     */
    logout: (body: LogoutBody = {}) => {
      switch (actor) {
        case "ADMIN":
          return engine.request("post", "/api/auth/admin/logout", {
            body,
            cookieTransportHeader,
          });
        case "MERCHANT":
          return engine.request("post", "/api/auth/merchant/logout", {
            body,
            cookieTransportHeader,
          });
        default:
          return engine.request("post", "/api/auth/consumer/logout", {
            body,
            cookieTransportHeader,
          });
      }
    },
  };
}

export type AuthDomain = ReturnType<typeof createAuthDomain>;
