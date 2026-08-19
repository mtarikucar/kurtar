import { useContext } from "react";
import { Redirect, Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth-context";
import { LoadingState } from "../../components/LoadingState";
import { Screen } from "../../components/Screen";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { PixelRatio, Text } from "react-native";

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
/** The tab icon's own drawn size — it does not scale with type. */
const SEKME_IKON = 24;
/** Absolute leading for the label, as everywhere else in this app: at
 * multiplied leading Android shaves the cedilla off ğ/ş/ç and the dot off
 * İ (spec §1.2). */
const SEKME_SATIR = 17;

/**
 * Icon + label line box + the padding above and below them, measured at
 * the user's own text size.
 *
 * A constant here was wrong twice over. Too small and the bar silently
 * drops its labels; large enough at 1x and the labels truncate the moment
 * someone raises their text size — "Favor…", "Sipari…", which is the
 * same loss of Turkish as the clipped cedilla, arriving by a different
 * route.
 */
function sekmeYuksekligi(olcek: number, satirSayisi: number): number {
  return SEKME_IKON + SEKME_SATIR * olcek * satirSayisi + s.s2 * 2 + s.s1;
}

/**
 * Above this text scale the longest label ("Favoriler", "Siparişler") no
 * longer fits one line of a six-tab bar on a 390pt phone, and the bar
 * silently truncates it to "Favor…". Wrapping keeps the whole word: a
 * person who raised their text size asked for MORE readable words, not
 * fewer of them.
 */
const IKI_SATIR_ESIGI = 1.15;

export default function TabsLayout() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const palet = usePalet();
  // The CONTEXT rather than `useSafeAreaInsets()`: that hook throws
  // without a provider, and this layout is one of the first things the
  // app mounts. A missing inset should cost a few points of padding, not
  // a crashed shell.
  const altBosluk = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const yaziOlcegi = PixelRatio.getFontScale();
  const satirSayisi = yaziOlcegi > IKI_SATIR_ESIGI ? 2 : 1;

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
        // The bar reserves its own height instead of letting the label's
        // line box decide it. Left to itself the bar sat flush with the
        // bottom of the screen and the cedilla of "Keşfet"/"Siparişler"
        // fell outside it — the tabs read "Kesfet"/"Siparisler", losing
        // Turkish. The device's bottom inset is ADDED to that height (and
        // paid out as padding) rather than eaten by it, so a phone with a
        // gesture bar and one with hardware keys both keep the descender.
        tabBarStyle: {
          backgroundColor: palet.yuzeyYukselti,
          borderTopWidth: 1,
          borderTopColor: palet.bgDerin,
          elevation: 0,
          height: sekmeYuksekligi(yaziOlcegi, satirSayisi) + altBosluk,
          paddingTop: s.s2,
          paddingBottom: altBosluk + s.s2,
        },
        // Font only — no height, no padding, no item margin: the bar
        // computes its own height (plus the device's bottom inset) around
        // the label's line box, and every point added to that box on TOP
        // pushed the label down instead of growing the bar.
        //
        // The leading is the one thing that does grow the box from the
        // inside. At micro's own 14pt the cedilla of "Keşfet" and
        // "Siparişler" was shaved off and the tabs read "Kesfet" /
        // "Siparisler" — the label was silently dropping Turkish. 17pt
        // clears the descender at 11pt Archivo. It stays ABSOLUTE, as
        // everywhere else in this app, because at multiplied leading
        // Android clips ğ/ş/ç and the İ dot (§1.2).
        tabBarLabelStyle: {
          fontFamily: yazi.micro.fontFamily,
          fontSize: yazi.micro.fontSize,
          lineHeight: SEKME_SATIR,
          letterSpacing: yazi.micro.letterSpacing,
        },
        // The label is rendered here rather than left to the navigator so
        // it can wrap. The navigator's own label is single-line and
        // ellipsises, which turns "Favoriler" into "Favor…" the moment
        // the text scale rises.
        tabBarLabel: ({ color, children }) => (
          <Text
            numberOfLines={satirSayisi}
            style={[
              yazi.micro,
              { lineHeight: SEKME_SATIR, color, textAlign: "center" },
            ]}
          >
            {children}
          </Text>
        ),
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
