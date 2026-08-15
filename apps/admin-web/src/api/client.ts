import { createClient } from "@kurtar/api-client";

/**
 * Module-scoped access-token store. `createClient()`'s single-flight
 * refresh logic (packages/api-client/src/engine.ts) is scoped to ONE
 * `RequestEngine` instance per `createClient()` call — recreating the
 * client on every React render (e.g. from inside a component) would give
 * every render its own `inFlightRefresh` closure and defeat the whole
 * point (docs/frontend-contract.md §3.5). So the client is a true module
 * singleton, and `AuthContext` only reads/writes this tiny mutable store —
 * it never touches `createClient()` itself.
 *
 * `getAccessToken`/`onTokensIssued` are read/written fresh on every call
 * per the contract's own instruction ("don't cache a closure over a stale
 * value") — a plain mutable variable with a getter/setter pair satisfies
 * that without needing React state (which would require the client to be
 * created inside a component).
 */
let currentAccessToken: string | null = null;

export function getStoredAccessToken(): string | null {
  return currentAccessToken;
}

export function setStoredAccessToken(token: string | null): void {
  currentAccessToken = token;
}

/** Fired exactly when a refresh attempt itself fails — the definitive
 * "log the user out" signal (docs/frontend-contract.md §3.2). AuthContext
 * is the sole subscriber (it needs to flip the whole app back to the
 * login screen the moment this fires, from anywhere — not just from a
 * request AuthContext itself made). */
type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;
export function setUnauthorizedListener(
  listener: UnauthorizedListener | null,
): void {
  unauthorizedListener = listener;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4750";

/**
 * The one kurtar API client instance for this app. `transport: "cookie"`
 * per docs/frontend-contract.md §4 — apps/admin-web is a browser session,
 * the refresh token lives ONLY in an httpOnly cookie, never read or stored
 * by this app's own code.
 */
export const client = createClient({
  baseUrl: apiBaseUrl,
  transport: "cookie",
  getAccessToken: () => currentAccessToken,
  onTokensIssued: (tokens) => {
    currentAccessToken = tokens.accessToken;
  },
  onUnauthorized: () => {
    currentAccessToken = null;
    unauthorizedListener?.();
  },
});
