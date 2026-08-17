import type { RequestEngine } from "../engine";
import type { RequestBody } from "../core-types";
import type { ClientActor, ClientTransport } from "../transport";

/** Every actor's logout route shares one body shape; pick any one as the alias. */
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
     * [I5 fix] Routed through `engine.refreshOnce()` — the SAME memoized
     * in-flight promise `request()`'s own 401 branch uses — rather than a
     * second, unmemoized `engine.request()` call. Before this fix, a
     * manual refresh racing an engine-triggered one (e.g. a cold-start
     * bootstrap refresh racing a screen's first authenticated request)
     * could present the same refresh token to the backend twice, which
     * reads as reuse and revokes the whole token family, silently
     * signing the user out. `refreshOnce()`/`performRefresh()` already
     * derive both the refresh token (via `getRefreshToken()`) and the
     * actor-scoped path (`refreshPath(actor)`) internally, so there is no
     * body/actor to pass here any more — this also fixes a real bug on
     * body-transport (consumer) clients: the OLD `engine.request()` path
     * forwarded whatever `body` the caller passed (every real call site
     * passed none, i.e. `{}`), so the actual refresh token never reached
     * the backend on a manual refresh at all — only the engine's own
     * 401-triggered `performRefresh()` ever built the body correctly.
     */
    refresh: () => engine.refreshOnce(),

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
