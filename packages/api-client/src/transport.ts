import type { components } from "./generated/openapi-types";

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
 * Which kind of principal this client signs in as. Required, and
 * deliberately not inferable from anything else: it selects the
 * actor-scoped auth routes (`/api/auth/{consumer|merchant|admin}/refresh`
 * and `.../logout`) that back this surface's session.
 *
 * Why those routes are per-actor at all: every kurtar surface talks to
 * the SAME backend origin, and a cookie is scoped by host+path — never by
 * port, and never by which frontend set it. One shared `/api/auth`
 * refresh cookie therefore meant whichever actor signed in LAST owned the
 * browser's only session, that logging out of one surface killed the
 * other's, and that any script on any same-site surface could trade that
 * cookie for an access token belonging to whoever it happened to be. Each
 * actor now gets its own cookie name AND path (`refreshToken_admin` at
 * `/api/auth/admin`, and so on), and the backend additionally re-checks
 * the presented token's own actor against the route it arrived on. See
 * backend/src/modules/auth/refresh-cookie-transport.util.ts.
 */
export type ClientActor = "CONSUMER" | "MERCHANT" | "ADMIN";

/**
 * The refresh routes' response shape — derived from the generated
 * `AuthTokensDto` schema, not hand-written (an earlier revision of this
 * file hand-declared this type as a documented workaround for a backend
 * gap — every auth-issuing operation lacked a response DTO at the time.
 * That gap is closed: `docs/openapi.json` now declares a real schema for
 * every one of them, so this alias is a straight re-export, kept only
 * because `CreateClientOptions.onTokensIssued` needs ONE stable shared
 * type across every call site that can issue tokens).
 *
 * `verifyOtp`/`merchantLogin`/`adminLogin`/`signup` return their OWN
 * richer, actor-specific types (each also carries a `user` object) —
 * see `domains/auth.ts` and `domains/merchant.ts`. Use `AuthTokens` only
 * for the fields every one of those shapes has in common.
 *
 * `refreshToken` is absent when the caller used cookie transport (the
 * backend strips it from the JSON body in that case — see
 * auth.controller.ts's `stripRefreshToken`); present for body transport.
 */
export type AuthTokens = components["schemas"]["AuthTokensDto"];

export interface CreateClientOptions {
  /** Origin only, e.g. "http://localhost:4750" — every generated operation path already includes the "/api" prefix. */
  baseUrl: string;
  transport: ClientTransport;
  /** Which actor's session this client manages — picks the actor-scoped `/api/auth/<actor>/refresh` + `/logout` routes. See `ClientActor`. */
  actor: ClientActor;
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
