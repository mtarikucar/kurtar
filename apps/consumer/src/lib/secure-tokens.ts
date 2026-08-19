import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Refresh-token persistence — expo-secure-store on device, never
 * AsyncStorage (see docs/frontend-contract.md §4 and the task brief's
 * global constraints: the backend revokes the whole refresh-token family
 * if a rotated token is ever presented twice, so it must live somewhere
 * that survives app restarts but isn't trivially readable the way
 * AsyncStorage is on a rooted/jailbroken device).
 *
 * The access token is deliberately NOT persisted here (or anywhere) —
 * it's short-lived (15m) and kept in memory only (see auth-context.tsx);
 * on a cold app start it's re-derived by exchanging the persisted refresh
 * token via the api-client's normal 401-triggered single-flight refresh.
 *
 * WEB: expo-secure-store ships `export default {}` for web — there is no
 * keychain in a browser, so every SecureStore call throws there. The web
 * build exists only so the app can be opened in a browser for review and
 * demos; it is not a shipping target (submissions are iOS/Android via
 * EAS). Rather than let a storage throw masquerade as a failed login, web
 * keeps the refresh token in memory for the tab's lifetime: a reload
 * signs you out, which is the honest behaviour for a surface that has
 * nowhere secure to put a 30-day credential.
 */
const REFRESH_TOKEN_KEY = "kurtar.refreshToken";
const isWeb = Platform.OS === "web";

let inMemoryWebToken: string | null = null;

export async function getStoredRefreshToken(): Promise<string | null> {
  if (isWeb) return inMemoryWebToken;
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setStoredRefreshToken(token: string): Promise<void> {
  if (isWeb) {
    inMemoryWebToken = token;
    return;
  }
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function clearStoredRefreshToken(): Promise<void> {
  if (isWeb) {
    inMemoryWebToken = null;
    return;
  }
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
