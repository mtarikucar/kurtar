import "../i18n";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AuthProvider, useAuth } from "../lib/auth-context";
import {
  asyncStoragePersister,
  queryClient,
  shouldPersistQuery,
} from "../lib/query-client";
import { registerPushTokenIfPermitted, resolvePushDeepLink } from "../lib/push";
import { useGlobalRedeemSync } from "../hooks/use-global-redeem-sync";

/** Handles a notification TAP (foreground, background, or cold-start) by
 * deep-linking into the offer/order it refers to — see push.ts's
 * `resolvePushDeepLink` for the payload shapes this branches on. */
function usePushNotificationRouting() {
  const router = useRouter();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        const target = resolvePushDeepLink(data);
        router.push(target as never);
      },
    );

    // Cold start via a tapped notification — the response that launched
    // the app isn't delivered to the listener above (it wasn't attached
    // yet), so it has to be fetched explicitly once on mount.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const target = resolvePushDeepLink(data);
      router.push(target as never);
    });

    return () => subscription.remove();
  }, [router]);
}

function RootNavigator() {
  const { status } = useAuth();
  usePushNotificationRouting();
  useGlobalRedeemSync(status === "signedIn");

  // Re-registers the push token on every cold start that lands directly in
  // (tabs) — the (auth)/permissions screen already registers it once
  // during onboarding, but a RETURNING signed-in user (silent refresh,
  // never touching that screen this session) would otherwise never
  // re-register after e.g. a reinstall or an Expo token rotation. Always
  // safe to call: it's a no-op unless notification permission was already
  // granted (see push.ts's doc comment).
  useEffect(() => {
    if (status === "signedIn") {
      registerPushTokenIfPermitted().catch(() => undefined);
    }
  }, [status]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="offer/[id]" options={{ presentation: "modal" }} />
      <Stack.Screen name="store/[id]" />
      <Stack.Screen name="purchase/[offerId]" options={{ presentation: "modal" }} />
      <Stack.Screen name="payment/[id]" options={{ presentation: "modal", gestureEnabled: false }} />
      <Stack.Screen
        name="redeem/[id]"
        options={{ presentation: "fullScreenModal", gestureEnabled: false }}
      />
      <Stack.Screen name="cancel/[id]" options={{ presentation: "modal" }} />
      <Stack.Screen name="rate/[id]" options={{ presentation: "modal" }} />
      <Stack.Screen name="order/[id]" />
      <Stack.Screen name="complaint/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="legal/[doc]" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
