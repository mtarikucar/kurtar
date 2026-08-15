import * as SecureStore from "expo-secure-store";

/**
 * Refresh-token persistence — expo-secure-store ONLY, never AsyncStorage
 * (see docs/frontend-contract.md §4 and the task brief's global
 * constraints: the backend revokes the whole refresh-token family if a
 * rotated token is ever presented twice, so it must live somewhere that
 * survives app restarts but isn't trivially readable the way AsyncStorage
 * is on a rooted/jailbroken device).
 *
 * The access token is deliberately NOT persisted here (or anywhere) — it's
 * short-lived (15m) and kept in memory only (see auth-context.tsx); on a
 * cold app start it's re-derived by exchanging the persisted refresh token
 * via the api-client's normal 401-triggered single-flight refresh.
 */
const REFRESH_TOKEN_KEY = "kurtar.refreshToken";

export async function getStoredRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setStoredRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function clearStoredRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
