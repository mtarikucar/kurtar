import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { s, yazi, type Palet } from "../../design/tokens";
import { pencereOrani } from "./perde";
import { kis } from "../kepenk/olcum";

/**
 * ALIŞ PENCERESİ — the pickup window as a rail (spec §4.3).
 *
 * The redundancy law again: the rail is the shape, and both ends of it
 * plus "now" carry their literal numbers in a fixed place. The marker is
 * the only thing on the block that moves, and it moves on the app's 60s
 * bucket like every other clock-driven thing — it never creeps.
 *
 * It is only ever rendered inside a `<Blok vurgu/>`, which paints
 * `yuzeyKaldirim`, so every ink here is card type.
 */
export function AlisPenceresi({
  simdiMs,
  baslangicMs,
  bitisMs,
  baslangic,
  bitis,
  simdi,
  gun,
  cumle,
  palet,
}: {
  simdiMs: number;
  baslangicMs: number;
  bitisMs: number;
  /** "18:30" */
  baslangic: string;
  /** "21:00" */
  bitis: string;
  /** "şimdi 18:34" */
  simdi: string;
  /** "BUGÜN" — pre-uppercased in tr.json. */
  gun: string;
  /** "Kepenk 2 sa 26 dk sonra iniyor" */
  cumle: string;
  palet: Palet;
}) {
  const oran = pencereOrani(simdiMs, baslangicMs, bitisMs);
  const basladi = simdiMs >= baslangicMs;

  return (
    <View style={styles.kap}>
      <View style={styles.ustSatir}>
        <Text style={[yazi.label, { color: palet.yaziSis }]} maxFontSizeMultiplier={1.3}>
          {gun}
        </Text>
        <Text style={[yazi.dataLg, { color: palet.yaziAna }]} maxFontSizeMultiplier={1.3}>
          {baslangic}
        </Text>
        <View style={styles.esnek} />
        <Text style={[yazi.dataLg, { color: palet.yaziAna }]} maxFontSizeMultiplier={1.3}>
          {bitis}
        </Text>
      </View>

      <View style={styles.rayAlani}>
        <View style={[styles.ray, { backgroundColor: palet.cubukRay }]}>
          {basladi ? (
            <View
              testID="alis-penceresi-gecen"
              style={[styles.gecen, { width: `${oran * 100}%`, backgroundColor: palet.sodyumDolgu }]}
            />
          ) : null}
        </View>
        <View
          testID="alis-penceresi-imleci"
          style={[styles.imlecYuvasi, { left: `${oran * 100}%` }]}
          pointerEvents="none"
        >
          <Svg width={12} height={7}>
            <Path d="M6 0 L12 7 H0 Z" fill={palet.yaziAna} />
          </Svg>
        </View>
      </View>

      <View style={styles.altSatir}>
        <Text
          style={[
            yazi.data,
            styles.simdi,
            {
              color: palet.yaziAna,
              // Pinned to the marker, but never off either end of the
              // rail: at ratio 0 a centred label would hang off the left
              // edge of the screen, which is where every un-opened window
              // puts it.
              left: `${kis(oran * 100, 8, 92)}%`,
            },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {simdi}
        </Text>
      </View>

      <Text
        style={[yazi.body, { color: palet.yaziSis }]}
        maxFontSizeMultiplier={1.4}
      >
        {cumle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { gap: s.s2 },
  ustSatir: { flexDirection: "row", alignItems: "baseline", gap: s.s2 },
  esnek: { flex: 1 },
  rayAlani: { height: 10, justifyContent: "center" },
  ray: { height: 4, borderRadius: 2, overflow: "hidden" },
  gecen: { height: 4 },
  imlecYuvasi: { position: "absolute", top: 0, marginLeft: -6 },
  altSatir: { height: 16 },
  // Pinned to the marker rather than centred under the block: the number
  // and the shape have to be in the same physical place to teach each
  // other (§2's redundancy law).
  simdi: { position: "absolute", marginLeft: -26 },
});
