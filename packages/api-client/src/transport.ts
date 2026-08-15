/**
 * `"cookie"` — apps/merchant-web, apps/admin-web (and landing, for whatever
 *   little authenticated surface it has): the refresh token travels ONLY as
 *   an httpOnly cookie the browser manages; requests must be sent with
 *   `credentials: "include"` for that cookie to travel cross-origin, and
 *   the four auth-issuing calls must set `X-Client-Transport: cookie` so
 *   the backend strips the refresh token out of the JSON body (see
 *   backend/src/modules/auth/auth.controller.ts's `wantsCookieOnlyTransport`).
 * `"body"` — apps/consumer (Expo): no meaningful browser cookie jar: the
 *   refresh token travels in the JSON response body and the app is
 *   responsible for persisting it (SecureStore) and handing it back via
 *   `getRefreshToken`.
 */
export type ClientTransport = "cookie" | "body";

/**
 * What POST /auth/otp/verify, /auth/merchant/login, /auth/admin/login, and
 * /auth/refresh actually return at runtime (backend/src/modules/auth/
 * services/token.service.ts's `IssuedTokens`). Declared by hand here — the
 * ONE deliberate exception to "every type is derived from generated/
 * openapi-types.ts" in this package. Why: none of these four operations
 * carry an `@ApiOkResponse` (or any response DTO) in the backend
 * controller, so openapi-typescript generates `Record<string, never>` for
 * their response body — an accurate reflection of the committed contract,
 * not a bug to work around silently. This type is read from the real
 * `IssuedTokens` interface (the actual runtime source of truth), not
 * guessed, and is exactly why: the single-flight refresh logic in
 * `engine.ts` and every app's login flow depend on knowing these fields
 * exist. See docs/frontend-contract.md's "known OpenAPI contract gaps"
 * section — worth a follow-up backend task to add `@ApiOkResponse` there
 * so this override can be deleted.
 *
 * `refreshToken` is absent when the caller used cookie transport (the
 * backend strips it from the JSON body in that case — see
 * auth.controller.ts's `stripRefreshToken`); present for body transport.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** ISO-8601 string as received over JSON — the backend's `Date` does not survive serialization. */
  refreshTokenExpiresAt?: string;
}

export interface CreateClientOptions {
  /** Origin only, e.g. "http://localhost:4750" — every generated operation path already includes the "/api" prefix. */
  baseUrl: string;
  transport: ClientTransport;
  /** Returns the current access token synchronously (from memory/React state/a ref) — read fresh on every request. */
  getAccessToken: () => string | null | undefined;
  /** Only consulted for transport:"body" — the current refresh token (e.g. from Expo SecureStore). Cookie transport doesn't need this; the browser attaches the refresh cookie itself. */
  getRefreshToken?: () => string | null | undefined;
  /** Called with a freshly-issued token pair after any successful login/verify/refresh — persist it here (React state, SecureStore, or a no-op for pure-cookie web sessions). */
  onTokensIssued?: (tokens: AuthTokens) => void;
  /** Called exactly when a refresh attempt itself fails (refresh token invalid, reused, or expired) — the definitive "log the user out" signal. */
  onUnauthorized?: () => void;
  /** Override fetch — mainly for tests, or an environment with no global fetch. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}
