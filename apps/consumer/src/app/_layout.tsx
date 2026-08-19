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
import { useUygulamaFontlari } from "../design/fonts";
import { ClockProvider } from "../design/saat";
import { ThemeProvider, usePalet } from "../design/theme";
import type { Faz } from "../design/tokens";

/**
 * Pins the palette for a review build, so a screenshot of the night phase
 * does not depend on the hour someone happens to run it. Read at BUILD
 * time from an `EXPO_PUBLIC_` variable, so a normal build inlines
 * `undefined` here and the app follows the sun as it should — there is no
 * runtime switch and nothing to reach in a shipped binary.
 *
 * Faking the browser clock instead does not work: the clock provider's
 * subscribers keep running on real timers while `Date.now()` stands
 * still, and the app renders nothing.
 *
 *   EXPO_PUBLIC_FAZ_ZORLA=gece npx expo export -p web
 */
const INCELEME_FAZI = (process.env.EXPO_PUBLIC_FAZ_ZORLA as Faz | undefined) || undefined;

/**
 * Pins the whole app's clock for a review build, through the provider's
 * own `sabitZaman` — the review screens already use it, so one instant
 * governs the palette, every countdown and every open/closed label at
 * once. Faking the BROWSER clock cannot do this: the provider's minute
 * bucket keeps the pre-fake time while components that read the clock
 * directly see the faked one, and the screen ends up disagreeing with
 * itself about what time it is.
 *
 *   EXPO_PUBLIC_INCELEME_ZAMANI=2026-08-19T17:35:00.000Z npx expo export -p web
 */
const INCELEME_ZAMANI = process.env.EXPO_PUBLIC_INCELEME_ZAMANI
  ? new Date(process.env.EXPO_PUBLIC_INCELEME_ZAMANI)
  : undefined;

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
      <Stack.Screen name="complaints/index" />
      <Stack.Screen name="complaints/[id]" />
      <Stack.Screen name="o/[id]" />
      <Stack.Screen name="report/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="legal/[doc]" />
      {/* The Phase 1 review gate — docs/design/consumer-app-spec.md §6. */}
      <Stack.Screen name="vitrin" />
    </Stack>
  );
}

/**
 * The status bar's icons follow the phase. It used to be pinned to
 * `dark`, which is right on the daylight street and wrong the moment the
 * ground goes to night — the clock and battery went black on a black
 * ground. It has to live INSIDE the theme provider to ask the question at
 * all, which is why it is a component rather than a line.
 */
function FazaGoreDurumCubugu() {
  const palet = usePalet();
  return <StatusBar style={palet.faz === "gece" ? "light" : "dark"} />;
}

export default function RootLayout() {
  // Nothing renders type until the three families are in (spec §1.2); a
  // load FAILURE also releases the gate, falling back to the system face
  // rather than holding the app on a blank screen forever.
  const fontlarHazir = useUygulamaFontlari();

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <AuthProvider>
        {/* One clock for the whole app, one palette swapped whole on the
            solar phase change (spec §1.1 / §2). */}
        <ClockProvider sabitZaman={INCELEME_ZAMANI}>
          <ThemeProvider fazZorla={INCELEME_FAZI}>
            <FazaGoreDurumCubugu />
            {fontlarHazir ? <RootNavigator /> : null}
          </ThemeProvider>
        </ClockProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
