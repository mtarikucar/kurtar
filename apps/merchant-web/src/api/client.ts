import { createClient, KurtarApiError } from "@kurtar/api-client";

/**
 * The single @kurtar/api-client instance for this app. Every screen goes
 * through THIS export — never `createClient(...)` a second time, and never
 * a hand-rolled `fetch` call (see docs/frontend-contract.md §3-4). Cookie
 * transport, per the transport rule for browser panels: the refresh token
 * lives only in an httpOnly cookie, never in memory/localStorage.
 *
 * The access token itself DOES live in memory here (a module-level
 * variable, not React state) because `getAccessToken` is called
 * synchronously by the engine on every request — it must never read a
 * stale closure. A tiny subscribe/getSnapshot pair exposes it to React via
 * `useSyncExternalStore` (see auth/AuthContext.tsx) so components can react
 * to login/logout without the client itself depending on React.
 *
 * NOTE on `onTokensIssued`: reading packages/api-client/src/engine.ts, this
 * callback only actually fires from the internal single-flight
 * `performRefresh()` path — the generic `request()` method never calls it
 * for an ordinary 2xx response. That means it fires for `/auth/merchant/refresh`,
 * but NOT for the login/signup calls that also mint a fresh token pair
 * (`client.auth.merchantLogin`, `client.merchant.signup`) — those hand
 * their result back to the caller instead. So `setAccessToken` is exported
 * here and AuthContext calls it explicitly right after a successful
 * login/signup response, in addition to the automatic refresh path.
 */

let accessToken: string | null = null;
const tokenListeners = new Set<() => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  tokenListeners.forEach((listener) => listener());
}

export function getAccessTokenSnapshot(): string | null {
  return accessToken;
}

export function subscribeAccessToken(listener: () => void): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

/** Fires exactly when a refresh attempt itself fails — the definitive
 * "log the user out" signal (see @kurtar/api-client's CreateClientOptions
 * doc comment). AuthContext subscribes to route to /giris. */
const unauthorizedListeners = new Set<() => void>();

export function subscribeUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4750";

export const client = createClient({
  baseUrl: apiBaseUrl,
  transport: "cookie",
  // MERCHANT: picks the merchant-scoped refresh/logout routes and, with
  // them, the merchant-only `refreshToken_merchant` cookie at path
  // /api/auth/merchant. Before actor scoping existed, this app and
  // admin-web shared ONE cookie on one backend origin — whoever signed in
  // last owned the browser's only session (see @kurtar/api-client's
  // ClientActor doc comment).
  actor: "MERCHANT",
  getAccessToken: () => accessToken,
  onTokensIssued: (tokens) => {
    setAccessToken(tokens.accessToken);
  },
  onUnauthorized: () => {
    setAccessToken(null);
    unauthorizedListeners.forEach((listener) => listener());
  },
});

/** Clears the in-memory access token without waiting for a failed request —
 * used right after a successful `client.auth.logout()` call, whose whole
 * point is that the session is over immediately, not on the next 401. */
export function clearAccessToken(): void {
  setAccessToken(null);
}

export { KurtarApiError };
