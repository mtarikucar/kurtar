import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { client } from "./api-client";

/**
 * Foreground presentation — without this, expo-notifications SDK 55+
 * defaults to NOT showing a banner while the app is open, which would make
 * a drop-time "new bag nearby" push silently invisible if the user happens
 * to have the app open at 18:30.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * The most recently registered Expo push token for this app run, kept so
 * `unregisterPushToken` (below) can DELETE the exact row logout must clear
 * without re-resolving it (that resolution can itself require permission
 * state that's no longer meaningful once the user is signing out). Module
 * state, not AsyncStorage — losing it on a cold start is fine, since the
 * only caller that matters (logout) always follows a session in which
 * `registerPushTokenIfPermitted` has already run at least once (root
 * layout registers on every `signedIn` transition, see app/_layout.tsx).
 */
let lastRegisteredExpoPushToken: string | null = null;

/**
 * Registers this device's Expo push token with the backend
 * (`POST /me/push-tokens` — see docs/frontend-contract.md). Must run only
 * AFTER the user is signed in (the endpoint is @Actors("CONSUMER")) and
 * only after notification permission is actually granted — this never
 * requests permission itself (the (auth)/permissions screen owns that UX
 * with honest copy about why); it's safe to call defensively any number
 * of times (idempotent no-op on the backend if the token is unchanged).
 *
 * Never throws — a push-registration failure (no physical device, missing
 * EAS project id in this dev environment, provider hiccup) must never
 * block sign-in or any other flow. Logged, not surfaced to the user.
 */
export async function registerPushTokenIfPermitted(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await client.account.pushTokens.register({
      expoPushToken: tokenResponse.data,
      platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
    });
    lastRegisteredExpoPushToken = tokenResponse.data;
  } catch (error) {
    console.warn("Push token registration skipped:", error);
  }
}

/**
 * Deregisters this device's Expo push token (`DELETE /me/push-tokens/
 * {token}`) — MUST be called before the session's tokens are torn down
 * (the endpoint is @Actors("CONSUMER")), otherwise the backend row stays
 * bound to the outgoing user until someone else's device happens to
 * register the same Expo token, and every transactional notification
 * (reservation confirmations, the pickup reminder with the redeem code in
 * plain text) keeps landing on a device that just signed out.
 *
 * Never throws — logout must always complete locally even if this
 * best-effort call fails (offline, already revoked, no token was ever
 * registered this run).
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    if (!lastRegisteredExpoPushToken) return;
    await client.account.pushTokens.remove(lastRegisteredExpoPushToken);
    lastRegisteredExpoPushToken = null;
  } catch (error) {
    console.warn("Push token unregistration skipped:", error);
  }
}

/** Destinations a notification tap can resolve to — consumed by the root
 * layout's response listener AND by `kurtar://` deep links (both funnel
 * through expo-router's own `href`, so this only needs to build a path). */
export type PushDeepLinkTarget = { pathname: string; params?: Record<string, string> };

/**
 * Every push this backend sends carries a `data` payload shaped by ONE of
 * four outbox handlers (see backend/src/modules/outbox/handlers/*.ts and
 * reservations/pickup-reminder-cron.service.ts — read directly, since none
 * of this is exposed through the OpenAPI contract, which only covers HTTP
 * operations):
 *   - offer.published (favorite/nearby) & offer.cancelled: {offerId, storeId}
 *   - reservation.confirmed: {reservationId, offerId, storeId}
 *   - reservation.redeemed rating-invite: {reservationId, storeId, action:"RATE"}
 *   - pickup reminder: {reservationId, storeId}
 * There is no `kind`/`type` discriminator in the payload itself, so
 * offer.published and offer.cancelled (both bare {offerId, storeId}) are
 * NOT distinguishable client-side — both land on the offer's detail
 * screen, which is directionally right for the (far more common)
 * new-offer case and still a reasonable, non-dead-end landing spot for the
 * cancellation case. Flagged as a minor backend follow-up (a `kind` field
 * in the push data payload) in the task report.
 */
export function resolvePushDeepLink(
  data: Record<string, unknown> | undefined,
): PushDeepLinkTarget {
  if (!data) return { pathname: "/(tabs)" };

  const reservationId =
    typeof data.reservationId === "string" ? data.reservationId : undefined;
  const offerId = typeof data.offerId === "string" ? data.offerId : undefined;
  const storeId = typeof data.storeId === "string" ? data.storeId : undefined;
  const action = typeof data.action === "string" ? data.action : undefined;

  if (reservationId && action === "RATE") {
    return { pathname: "/rate/[id]", params: { id: reservationId } };
  }
  if (reservationId) {
    return { pathname: "/order/[id]", params: { id: reservationId } };
  }
  if (offerId && storeId) {
    return { pathname: "/offer/[id]", params: { id: offerId, storeId } };
  }
  return { pathname: "/(tabs)" };
}
