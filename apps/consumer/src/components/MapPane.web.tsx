import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { usePalet } from "../design/theme";
import { r, s, yazi } from "../design/tokens";
import type { MapPaneProps } from "./MapPane.types";

/**
 * Web build of the map pane. `react-native-maps` has no supported web
 * renderer (spec §4.2 specifies `PROVIDER_GOOGLE` native markers with
 * `tracksViewChanges` bitmap snapshots — none of that exists on web), so
 * the `.native.tsx` sibling is never even bundled for web — Metro/webpack
 * picks this file instead by the `.web.tsx` extension convention, so
 * there is no risk of the native map module crashing a web session.
 *
 * This is an honest degrade, not a dead end: a closed-shutter illustration
 * plus real copy explaining why, built from the SAME design tokens as
 * every other surface (not the old generic empty-state icon). Callers
 * that also show a results list below the map (the dedicated Harita tab)
 * still show real data on web — only the literal map tile is unavailable.
 *
 * It paints `bgDerin` — this pane IS the map's own ground, not a card laid
 * over it — so every word on it is recess type.
 */
export function MapPane({ onSwitchToList }: MapPaneProps) {
  const { t } = useTranslation();
  const palet = usePalet();

  return (
    <View style={[styles.kap, { backgroundColor: palet.bgDerin }]}>
      <Ionicons name="map-outline" size={28} color={palet.yaziSisCukur} />
      <Text style={[yazi.bodyStrong, styles.baslik, { color: palet.yaziAnaCukur }]}>
        {t("discover.viewMap")}
      </Text>
      <Text style={[yazi.body, styles.govde, { color: palet.yaziSisCukur }]}>
        {t("discover.mapUnavailableWeb")}
      </Text>
      <Pressable
        onPress={onSwitchToList}
        accessibilityRole="button"
        accessibilityLabel={t("discover.viewList")}
        style={({ pressed }) => [
          styles.cta,
          { borderColor: palet.cizgiKil },
          pressed ? { opacity: 0.85 } : null,
        ]}
      >
        <Text style={[yazi.label, { color: palet.yaziAnaCukur }]}>{t("discover.viewList")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  kap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: s.s6,
  },
  baslik: { marginTop: s.s2 },
  govde: { textAlign: "center" },
  cta: {
    marginTop: s.s3,
    minHeight: 36,
    paddingHorizontal: s.s4,
    borderRadius: r.cta,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
