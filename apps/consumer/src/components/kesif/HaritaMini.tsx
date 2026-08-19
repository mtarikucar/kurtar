import { Animated, StyleSheet } from "react-native";
import { usePalet } from "../../design/theme";
import { HARITA_DARALTILMIS, HARITA_ISTIRAHAT, HARITA_KAYDIRMA_ESIGI } from "../../lib/kesif";
import { MapPane } from "../MapPane";
import type { MapPaneProps } from "../MapPane.types";

/**
 * HARİTA MİNİ — the collapsing map header (spec §4.1).
 *
 * "The map is a collapsing header, not a permanent 168pt block. At rest
 * it is 168pt; on the first 112pt of scroll the CONTAINER height animates
 * 168 → 56 with `overflow: hidden` while the `MapView` inside keeps a
 * constant 168pt height and translates up. The `MapView` is never
 * resized." This wraps `MapPane` (which is itself the native/web split —
 * see MapPane.web.tsx for the web degradation) rather than reaching into
 * it, so the same collapsing shell works whether the child is a real
 * `react-native-maps` view or the honest web placeholder.
 */
export function HaritaMini({
  scrollY,
  ...mapPaneProps
}: MapPaneProps & { scrollY: Animated.Value }) {
  const palet = usePalet();

  const yukseklik = scrollY.interpolate({
    inputRange: [0, HARITA_KAYDIRMA_ESIGI],
    outputRange: [HARITA_ISTIRAHAT, HARITA_DARALTILMIS],
    extrapolate: "clamp",
  });
  const kaydirmaY = scrollY.interpolate({
    inputRange: [0, HARITA_KAYDIRMA_ESIGI],
    outputRange: [0, -(HARITA_ISTIRAHAT - HARITA_DARALTILMIS)],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={[styles.disKap, { height: yukseklik, backgroundColor: palet.bgDerin }]}
      testID="kesif-harita-mini"
    >
      <Animated.View
        style={[styles.icKap, { transform: [{ translateY: kaydirmaY }] }]}
      >
        <MapPane {...mapPaneProps} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  disKap: { overflow: "hidden", width: "100%" },
  icKap: { height: HARITA_ISTIRAHAT, width: "100%" },
});
