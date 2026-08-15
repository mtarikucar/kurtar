import { createClient, type AuthTokens } from "@kurtar/api-client";
import {
  clearStoredRefreshToken,
  setStoredRefreshToken,
} from "./secure-tokens";

/**
 * Origin only — every generated operation path already starts with /api
 * (see docs/frontend-contract.md §6). Expo only inlines env vars prefixed
 * EXPO_PUBLIC_ into the bundle.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4750";

/**
 * The single shared token store the api-client reads from/writes to.
 * Plain mutable refs (not React state) so `getAccessToken`/`getRefreshToken`
 * — called fresh on every single request per the contract — never read a
 * stale value captured in a closure. React state for "is there a session"
 * lives in auth-context.tsx and is driven BY this store, not the other way
 * around.
 *
 * The access token is memory-only by design (15m TTL, never worth
 * persisting — see secure-tokens.ts's doc comment). The refresh token is
 * mirrored to expo-secure-store on every issuance so a cold app start can
 * silently re-establish a session.
 */
export const tokenStore = {
  accessToken: null as string | null,
  refreshToken: null as string | null,
};

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onClientUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

type TokensIssuedListener = (tokens: AuthTokens) => void;
const tokensIssuedListeners = new Set<TokensIssuedListener>();

export function onClientTokensIssued(listener: TokensIssuedListener): () => void {
  tokensIssuedListeners.add(listener);
  return () => tokensIssuedListeners.delete(listener);
}

/**
 * One client instance for the whole app lifetime — `transport: "body"` per
 * the consumer-surface rule (no meaningful cookie jar on native). Relies
 * entirely on the client's own single-flight refresh (packages/api-client/
 * src/engine.ts) — this file adds no second retry-on-401 path.
 */
export const client = createClient({
  baseUrl: API_BASE_URL,
  transport: "body",
  getAccessToken: () => tokenStore.accessToken,
  getRefreshToken: () => tokenStore.refreshToken,
  onTokensIssued: (tokens) => {
    tokenStore.accessToken = tokens.accessToken;
    if (tokens.refreshToken) {
      tokenStore.refreshToken = tokens.refreshToken;
      // Fire-and-forget: SecureStore write failing must never block the
      // in-memory session from working for the rest of this app run — it
      // only degrades the NEXT cold start back to a logged-out state,
      // which is the same UX as never having persisted it.
      setStoredRefreshToken(tokens.refreshToken).catch(() => undefined);
    }
    for (const listener of tokensIssuedListeners) listener(tokens);
  },
  onUnauthorized: () => {
    tokenStore.accessToken = null;
    tokenStore.refreshToken = null;
    clearStoredRefreshToken().catch(() => undefined);
    for (const listener of unauthorizedListeners) listener();
  },
});

// KurtarApiError is deliberately NOT re-exported from here — import it
// directly from "@kurtar/api-client" instead (see errors.ts/query-client.ts
// for the pattern). A re-export through this module gets swept up by
// `jest.mock("./api-client")` (auto-mock) in tests, which replaces the
// class with a mock constructor — any `instanceof KurtarApiError` check
// against an error built from the REAL class (imported straight from
// @kurtar/api-client, as every test fixture does) then silently returns
// false. Importing the real export directly sidesteps that class of bug
// entirely, in both app code and tests.
export type { AuthTokens };
