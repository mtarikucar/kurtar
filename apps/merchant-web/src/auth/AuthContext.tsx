import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  client,
  setAccessToken,
  clearAccessToken,
  subscribeUnauthorized,
} from "../api/client";
import type { MerchantMe } from "../api/response-types";

export const MERCHANT_ME_KEY = ["merchant", "me"] as const;

export interface SignupInput {
  legalName: string;
  tradeName: string;
  taxId: string;
  iban: string;
  email: string;
  password: string;
  ownerName: string;
}

export type AuthStatus = "checking" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  merchant: MerchantMe | null;
  login: (email: string, password: string) => Promise<MerchantMe>;
  signup: (input: SignupInput) => Promise<MerchantMe>;
  logout: () => Promise<void>;
  refreshMerchant: () => Promise<MerchantMe | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<MerchantMe> {
  return client.merchant.getMe();
}

/**
 * Session state for the whole app. Session RESTORE (a page reload with no
 * access token in memory) works by simply calling `getMe()` on mount: the
 * engine's single-flight refresh (packages/api-client/src/engine.ts) turns
 * the resulting 401 into one `/auth/merchant/refresh` call using the
 * merchant-scoped httpOnly cookie, and either succeeds (session restored) or throws (no valid
 * session) — this component never has to special-case "returning user"
 * vs "fresh visit" itself. Per docs/frontend-contract.md §7.4/§3.5: no
 * token is ever read from or written to localStorage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: MERCHANT_ME_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // The definitive "log the user out" signal — a refresh attempt itself
  // failed (packages/api-client's onUnauthorized). Drop any cached
  // profile so every route guard re-derives "unauthenticated" immediately,
  // even if this fires while the merchant is mid-session deep in the app.
  useEffect(
    () =>
      subscribeUnauthorized(() => {
        queryClient.setQueryData(MERCHANT_ME_KEY, undefined);
      }),
    [queryClient],
  );

  const refreshMerchant = useCallback(async (): Promise<MerchantMe | null> => {
    try {
      return await queryClient.fetchQuery({
        queryKey: MERCHANT_ME_KEY,
        queryFn: fetchMe,
      });
    } catch {
      return null;
    }
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string): Promise<MerchantMe> => {
      // client.auth.merchantLogin's typed return is AuthTokens (the one
      // deliberate override in @kurtar/api-client — see transport.ts) —
      // engine.ts only calls onTokensIssued from the internal refresh path,
      // never for a plain login response, so this app persists the token
      // itself right here (see api/client.ts's NOTE on onTokensIssued).
      const result = await client.auth.merchantLogin({ email, password });
      setAccessToken(result.accessToken);
      const merchant = await refreshMerchant();
      if (!merchant) {
        throw new Error(
          "GET /merchants/me failed immediately after a successful login",
        );
      }
      return merchant;
    },
    [refreshMerchant],
  );

  const signup = useCallback(
    async (input: SignupInput): Promise<MerchantMe> => {
      const result = await client.merchant.signup(input);
      setAccessToken(result.accessToken);
      const merchant = await refreshMerchant();
      if (!merchant) {
        throw new Error(
          "GET /merchants/me failed immediately after a successful signup",
        );
      }
      return merchant;
    },
    [refreshMerchant],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await client.auth.logout();
    } catch {
      // Best-effort server-side revocation — a network failure here must
      // never block the client-side logout below (the whole point of
      // logging out is that THIS session ends immediately); swallowed
      // rather than rethrown so callers that fire-and-forget this
      // (`onClick={() => void logout()}`) never see an unhandled
      // rejection over what the user experiences as a successful logout.
    } finally {
      clearAccessToken();
      queryClient.setQueryData(MERCHANT_ME_KEY, undefined);
      queryClient.clear();
    }
  }, [queryClient]);

  const status: AuthStatus = meQuery.isPending
    ? "checking"
    : meQuery.data
      ? "authenticated"
      : "unauthenticated";

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      merchant: meQuery.data ?? null,
      login,
      signup,
      logout,
      refreshMerchant,
    }),
    [status, meQuery.data, login, signup, logout, refreshMerchant],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
