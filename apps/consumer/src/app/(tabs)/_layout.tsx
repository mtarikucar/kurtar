import { Redirect, Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth-context";
import { LoadingState } from "../../components/LoadingState";
import { Screen } from "../../components/Screen";
import { usePalet } from "../../design/theme";
import { yazi } from "../../design/tokens";

/**
 * The tab bar is the one piece of chrome on every screen in the app, so
 * its job is to recede: it is the shelf the street stands on, not an
 * announcement.
 *
 * It was a pure white slab across the bottom of every night frame — the
 * single most jarring thing in the whole walk — because it never asked
 * the palette anything. Now it takes `surface.yukselti`, which §1.1
 * assigns to it by name alongside the bottom sheets and the sticky CTA
 * bar, and separates from the ground the way every other object in this
 * app does: a painted contact edge, not a shadow (§1.3 / §5.1).
 *
 * The lit tab is sodium — `sodyumYazi`, the phase's legible sodium, since
 * #FFB23F on the day's ivory shelf is 1.45:1 — and the unlit ones are the
 * card's mist ink. One tab is on; the rest are shut. That is the same
 * sentence the rest of the app speaks.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const palet = usePalet();

  if (status === "loading") {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (status === "signedOut") {
    return <Redirect href="/(auth)/phone" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palet.sodyumYazi,
        tabBarInactiveTintColor: palet.yaziSis,
        // The scene keeps the street's ground, so a tab swap never flashes
        // a white frame between two dark screens.
        sceneStyle: { backgroundColor: palet.bgAsfalt },
        tabBarStyle: {
          backgroundColor: palet.yuzeyYukselti,
          borderTopWidth: 1,
          borderTopColor: palet.bgDerin,
          elevation: 0,
        },
        // Font only — no height, no padding, no item margin. The bar
        // computes its own height (plus the device's bottom inset) around
        // the label's line box, and every point added to that box on top
        // pushed the ş of "Keşfet" and "Siparişler" under the bar's own
        // edge. The line height is ABSOLUTE, as everywhere else in this
        // app, because at multiplied leading Android clips ğ/ş/ç and the
        // İ dot (§1.2).
        tabBarLabelStyle: {
          fontFamily: yazi.micro.fontFamily,
          fontSize: yazi.micro.fontSize,
          lineHeight: yazi.micro.lineHeight,
          letterSpacing: yazi.micro.letterSpacing,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.discover"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="harita"
        options={{
          title: t("tabs.harita"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t("tabs.search"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t("tabs.favorites"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t("tabs.orders"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
