import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { client, onClientUnauthorized, tokenStore } from "./api-client";
import {
  clearStoredRefreshToken,
  getStoredRefreshToken,
} from "./secure-tokens";

const USER_CACHE_KEY = "kurtar.user";

/** The consumer identity fields the app displays (phone on the profile
 * screen, name if ever set). Not sensitive beyond what the user themselves
 * typed in to sign up, so it's fine to cache in AsyncStorage as a plain
 * read-model — the actual credential (refresh token) never lives here. */
export interface ConsumerUser {
  id: string;
  phone: string;
  status: string;
  name: string | null;
}

interface AuthContextValue {
  status: "loading" | "signedOut" | "signedIn";
  user: ConsumerUser | null;
  requestOtp: (phone: string) => ReturnType<typeof client.auth.requestOtp>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistUser(user: ConsumerUser | null) {
  if (user) {
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(USER_CACHE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = useState<ConsumerUser | null>(null);
  const bootstrapped = useRef(false);

  const signOutLocally = useCallback(() => {
    tokenStore.accessToken = null;
    tokenStore.refreshToken = null;
    setUser(null);
    setStatus("signedOut");
    persistUser(null).catch(() => undefined);
  }, []);

  // Cold-start bootstrap: a persisted refresh token means we can silently
  // re-establish a session via one proactive refresh call — this is the
  // documented exception to "never call client.auth.refresh() yourself"
  // (docs/frontend-contract.md §3.5: proactive refresh on app foreground/
  // start is fine; it's a SECOND retry-on-401 path that's forbidden).
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      const [storedRefreshToken, cachedUserRaw] = await Promise.all([
        getStoredRefreshToken(),
        AsyncStorage.getItem(USER_CACHE_KEY),
      ]);

      if (!storedRefreshToken) {
        setStatus("signedOut");
        return;
      }

      tokenStore.refreshToken = storedRefreshToken;
      try {
        await client.auth.refresh();
        if (cachedUserRaw) {
          setUser(JSON.parse(cachedUserRaw) as ConsumerUser);
        }
        setStatus("signedIn");
      } catch {
        // onUnauthorized (wired in api-client.ts) already cleared
        // tokenStore + SecureStore for us.
        setUser(null);
        await persistUser(null);
        setStatus("signedOut");
      }
    })().catch(() => setStatus("signedOut"));
  }, []);

  // Reacts to a session dying mid-use (e.g. an ordinary request's
  // automatic refresh fails because the family was revoked) — not just
  // the cold-start path above.
  useEffect(() => {
    return onClientUnauthorized(() => {
      setUser(null);
      setStatus("signedOut");
      persistUser(null).catch(() => undefined);
    });
  }, []);

  const requestOtp = useCallback(
    (phone: string) => client.auth.requestOtp({ phone }),
    [],
  );

  const verifyOtp = useCallback(async (phone: string, code: string) => {
    const result = await client.auth.verifyOtp({ phone, code });
    const nextUser: ConsumerUser = {
      id: result.user.id,
      phone: result.user.phone,
      status: result.user.status,
      name: result.user.name ?? null,
    };
    setUser(nextUser);
    setStatus("signedIn");
    await persistUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await client.auth.logout();
    } catch {
      // Best-effort — even if the server call fails (offline, already
      // revoked), the local session must still end.
    }
    await clearStoredRefreshToken();
    signOutLocally();
  }, [signOutLocally]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, requestOtp, verifyOtp, logout }),
    [status, user, requestOtp, verifyOtp, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
