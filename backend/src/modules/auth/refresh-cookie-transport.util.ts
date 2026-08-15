import { Request, Response } from "express";
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
 */
export const REFRESH_COOKIE = "refreshToken";
// Deliberately the /auth prefix, NOT whichever controller happens to be
// setting the cookie this time — the Path attribute controls which
// request paths the cookie is SENT BACK on, not which path set it. Every
// caller (auth's own login/verify/refresh, and now merchant signup) needs
// the cookie to reach POST /api/auth/refresh later, so they all set it
// with this same path regardless of where they themselves live.
export const REFRESH_COOKIE_PATH = "/api/auth";

const CLIENT_TRANSPORT_HEADER = "x-client-transport";
const COOKIE_TRANSPORT_VALUE = "cookie";

export function wantsCookieOnlyTransport(req: Request): boolean {
  const value = req.header(CLIENT_TRANSPORT_HEADER);
  return (
    typeof value === "string" && value.toLowerCase() === COOKIE_TRANSPORT_VALUE
  );
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
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
 * Sets the refresh cookie on every response (harmless for callers that
 * ignore it) and returns the raw refresh token in the JSON body UNLESS
 * `stripBody` is set. Every call site computes `stripBody` from
 * `wantsCookieOnlyTransport(req)` — i.e. the caller's OWN declared
 * transport — not inferred after the fact from whether a cookie happened
 * to be presented (AuthController.refresh additionally ORs in "a cookie
 * was actually presented this call" as a defense-in-depth fallback; that
 * OR stays local to refresh()'s own call site, not folded in here).
 */
export function respondWithTokens<T extends IssuedTokens>(
  res: Response,
  result: T,
  stripBody: boolean,
): T | Omit<T, "refreshToken"> {
  setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
  return stripBody ? stripRefreshToken(result) : result;
}
