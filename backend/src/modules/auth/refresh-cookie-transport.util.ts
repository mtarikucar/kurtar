import { Request, Response } from "express";
import { PrincipalType } from "@prisma/client";
import { IssuedTokens } from "./services/token.service";

/**
 * The `X-Client-Transport: cookie` convention (Task 3's review finding,
 * originally fixed only in auth.controller.ts): a browser client MUST be
 * able to mint a session without a 30-day refresh token ever landing in
 * JS-readable JSON, because any XSS on that page can read it and the
 * httpOnly cookie's whole purpose is defeated the moment the same value
 * also travels in the body. Extracted out of AuthController into its own
 * module so every endpoint that mints a fresh token pair in a
 * browser-reachable response — not just /auth/* — shares ONE
 * implementation, never a second hand-copied version. `merchants.
 * controller.ts`'s signup() is the second real consumer (a merchant-web
 * registration screen is exactly the browser flow this exists for);
 * anything that mints tokens in the future should reuse this too, not
 * reimplement it.
 *
 * *** ACTOR SCOPING — the cross-actor session-bleed fix ***
 * There used to be exactly ONE cookie here: `refreshToken`, path
 * `/api/auth`, with no actor in either the name or the path. Every kurtar
 * surface (merchant-web, admin-web, landing, the Expo app's web build)
 * talks to the SAME backend origin, and a cookie is scoped by host+path —
 * never by port, and never by which frontend set it. One unscoped cookie
 * shared by three actors meant:
 *
 *  - whichever actor authenticated LAST owned the browser's only refresh
 *    cookie, so signing into admin-web silently destroyed the merchant
 *    session in the next tab, and logging out of either killed both;
 *  - admin-web's mount-time session restore called POST /auth/refresh, got
 *    a 200 back off a MERCHANT's cookie, and rendered an authenticated
 *    admin shell for someone who is not an admin (every admin endpoint
 *    then correctly 403'd — a broken shell rather than a data leak, but
 *    the actor boundary was already gone by that point);
 *  - httpOnly bought nothing across that boundary: any script on any
 *    same-site surface could `fetch("/api/auth/refresh", {credentials:
 *    "include"})` and be handed an access token for whichever actor had
 *    most recently signed in.
 *
 * Each actor now gets its OWN cookie name AND its own path prefix:
 *
 *   CONSUMER  refreshToken_consumer  path=/api/auth/consumer
 *   MERCHANT  refreshToken_merchant  path=/api/auth/merchant
 *   ADMIN     refreshToken_admin     path=/api/auth/admin
 *
 * The three sessions coexist instead of overwriting one another, and the
 * browser only ever attaches a given actor's cookie to that actor's own
 * `<prefix>/refresh` and `<prefix>/logout` routes. `TokenService.refresh`
 * additionally re-checks the stored token's `principalType` against the
 * actor whose route was called (its `expectedActor` argument), so even a
 * hand-crafted request that puts a merchant's refresh token on the admin
 * route gets a 401 instead of an ADMIN access token — the cookie
 * attributes are the ergonomics, that check is the enforcement.
 */

/** URL segment + cookie-name suffix per actor. Both derive from this one map. */
const ACTOR_SEGMENT: Record<PrincipalType, string> = {
  CONSUMER: "consumer",
  MERCHANT: "merchant",
  ADMIN: "admin",
};

export function refreshCookieName(actor: PrincipalType): string {
  return `refreshToken_${ACTOR_SEGMENT[actor]}`;
}

/**
 * The Path attribute controls which request paths the cookie is SENT BACK
 * on, not which path set it — so this is always the actor's own auth
 * prefix, regardless of which controller happens to be minting the token
 * (merchants.controller.ts's signup() mints a MERCHANT session from a
 * completely different route and still needs its cookie to reach POST
 * /api/auth/merchant/refresh later).
 */
export function refreshCookiePath(actor: PrincipalType): string {
  return `/api/auth/${ACTOR_SEGMENT[actor]}`;
}

/**
 * The pre-actor-scoping cookie. Never set any more — only cleared, so a
 * browser still holding one from before this change stops carrying a
 * long-lived, unscoped 30-day credential around.
 */
const LEGACY_REFRESH_COOKIE = "refreshToken";
const LEGACY_REFRESH_COOKIE_PATH = "/api/auth";

const CLIENT_TRANSPORT_HEADER = "x-client-transport";
const COOKIE_TRANSPORT_VALUE = "cookie";

export function wantsCookieOnlyTransport(req: Request): boolean {
  const value = req.header(CLIENT_TRANSPORT_HEADER);
  return (
    typeof value === "string" && value.toLowerCase() === COOKIE_TRANSPORT_VALUE
  );
}

/** Reads the presented refresh cookie for ONE actor — never another's. */
export function readRefreshCookie(
  req: Request,
  actor: PrincipalType,
): string | undefined {
  return req.cookies?.[refreshCookieName(actor)];
}

export function setRefreshCookie(
  res: Response,
  actor: PrincipalType,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(refreshCookieName(actor), token, {
    httpOnly: true,
    // Production always; any other deployment opts in once it is
    // actually behind TLS. This used to be `=== "production"` alone,
    // which wrote the long-lived session credential WITHOUT Secure on
    // staging — a validated NODE_ENV and a real deployment target — so it
    // travelled in cleartext on any plain-HTTP hop. Hard-coding Secure
    // for staging instead would break sign-in there outright:
    // ops/docker-compose.staging.yml terminates no TLS today, so the flag
    // is the deployment's to set (REFRESH_COOKIE_SECURE=true).
    secure:
      process.env.NODE_ENV === "production" ||
      process.env.REFRESH_COOKIE_SECURE === "true",
    sameSite: "strict" as const,
    path: refreshCookiePath(actor),
    expires: expiresAt,
  });
  clearLegacyRefreshCookie(res);
}

export function clearRefreshCookie(res: Response, actor: PrincipalType): void {
  res.clearCookie(refreshCookieName(actor), {
    path: refreshCookiePath(actor),
  });
  clearLegacyRefreshCookie(res);
}

function clearLegacyRefreshCookie(res: Response): void {
  res.clearCookie(LEGACY_REFRESH_COOKIE, { path: LEGACY_REFRESH_COOKIE_PATH });
}

/**
 * Strip the refresh token from the JSON body so it travels only in the
 * httpOnly cookie for callers already using cookie transport. Mobile
 * (React Native SecureStore) callers have no cookie jar in that sense, so
 * they keep receiving it in the body — see respondWithTokens() below.
 */
export function stripRefreshToken<T extends { refreshToken: string }>(
  result: T,
): Omit<T, "refreshToken"> {
  const { refreshToken: _r, ...rest } = result;
  return rest;
}

/**
 * Sets the actor's refresh cookie on every response (harmless for callers
 * that ignore it) and returns the raw refresh token in the JSON body
 * UNLESS `stripBody` is set. Every call site computes `stripBody` from
 * `wantsCookieOnlyTransport(req)` — i.e. the caller's OWN declared
 * transport — not inferred after the fact from whether a cookie happened
 * to be presented (AuthController's refresh handlers additionally OR in
 * "a cookie was actually presented this call" as a defense-in-depth
 * fallback; that OR stays local to those call sites, not folded in here).
 */
export function respondWithTokens<T extends IssuedTokens>(
  res: Response,
  actor: PrincipalType,
  result: T,
  stripBody: boolean,
): T | Omit<T, "refreshToken"> {
  setRefreshCookie(
    res,
    actor,
    result.refreshToken,
    result.refreshTokenExpiresAt,
  );
  return stripBody ? stripRefreshToken(result) : result;
}
