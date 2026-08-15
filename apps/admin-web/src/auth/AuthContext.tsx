import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { KurtarApiError } from "@kurtar/api-client";
import {
  client,
  setStoredAccessToken,
  setUnauthorizedListener,
} from "../api/client";
import type { AdminAuthUser } from "../api/admin-types";

/**
 * Non-sensitive profile cache (id/email/name only — NEVER a token) so the
 * header can keep showing "signed in as X" across a page reload without a
 * dedicated GET /admin/me endpoint (there isn't one — see AuthProvider's
 * doc comment below). sessionStorage, not localStorage: cleared when the
 * tab closes, matching a session's real lifetime, and explicitly allowed
 * by the brief's rule ("no tokens in localStorage") — this holds a display
 * name, not a credential.
 */
const PROFILE_CACHE_KEY = "kurtar_admin_profile";

function readCachedProfile(): AdminAuthUser | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AdminAuthUser) : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(user: AdminAuthUser | null): void {
  try {
    if (user) sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // sessionStorage unavailable (private mode, etc.) — display-only cache, safe to skip.
  }
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AdminAuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AdminAuthUser | null>(null);
  // Guards a real, observed race: the mount-time session-restore
  // `client.auth.refresh()` below can still be in flight when a manual
  // login (LoginPage) completes first and faster — a fast scripted login,
  // or a slow network on the restore call. Without this flag, the
  // restore's LATER-arriving result would overwrite the state login()
  // just set (e.g. downgrading back to "unauthenticated" for a split
  // second, or vice versa). Deliberately does NOT guard
  // `handleUnauthorized` below — that stays unconditional, since it must
  // keep firing for a genuine LATER session expiry, long after either of
  // these two calls has settled.
  const sessionSettledRef = useRef(false);

  const handleUnauthorized = useCallback(() => {
    setStoredAccessToken(null);
    writeCachedProfile(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    setUnauthorizedListener(handleUnauthorized);
    return () => setUnauthorizedListener(null);
  }, [handleUnauthorized]);

  useEffect(() => {
    // Session restore on page load: the access token lives only in memory
    // (never persisted, per the brief's "no tokens in localStorage" rule),
    // so a hard reload always starts with none. The httpOnly refresh
    // cookie may still be valid, though — this is the one legitimate
    // proactive `client.auth.refresh()` call the contract calls out
    // (docs/frontend-contract.md §3.5: "e.g. refreshing on app foreground
    // before the access token's known 15m TTL expires" — restoring a
    // session on load is the same category of case).
    //
    // There is no GET /admin/me endpoint in this API (confirmed by
    // reading backend/src/modules/auth and backend/src/modules/admin — no
    // "who am I" route exists for the ADMIN actor, and POST /auth/refresh
    // returns only {accessToken, refreshToken?, refreshTokenExpiresAt},
    // never `user`). So a successful silent refresh restores the SESSION
    // (the admin stays authenticated and every subsequent API call works)
    // but not necessarily the cached name/email display if the cache was
    // already cleared — the sessionStorage cache above is what actually
    // survives a reload in the same tab.
    let cancelled = false;
    client.auth
      .refresh()
      .then(() => {
        if (cancelled || sessionSettledRef.current) return;
        sessionSettledRef.current = true;
        setUser(readCachedProfile());
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled || sessionSettledRef.current) return;
        sessionSettledRef.current = true;
        writeCachedProfile(null);
        setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await client.auth.adminLogin({ email, password });
    sessionSettledRef.current = true;
    writeCachedProfile(result.user);
    setUser(result.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await client.auth.logout();
    } catch (err) {
      // Logout is a "best-effort revoke" — a network failure here should
      // never trap the admin in a state where the UI still claims they're
      // signed in. Only a genuine KurtarApiError is worth swallowing
      // silently; anything else re-throws.
      if (!(err instanceof KurtarApiError)) throw err;
    }
    setStoredAccessToken(null);
    writeCachedProfile(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
