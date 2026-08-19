import { StyleSheet, Text, View } from "react-native";
import { usePalet } from "../../design/theme";
import { r, yazi } from "../../design/tokens";

/**
 * KURTARILDI — the redeemed mark on a past order row (spec §4.6): "ivory
 * Archivo Black 12 on a sodium fill, rotated −3°, not a green stamp,
 * because there is no green in this app." A celebration, so it gets the
 * one other rotated element the spec allows outside the error state's
 * torn paper note and the card's own TÜKENDİ sticker (§3/§5.14's "do not
 * tilt" rule is about the CARD; this is a small text stamp, the same
 * device the card itself uses for TÜKENDİ, just sodium instead of tente
 * and tilted the other way — spent rather than closed).
 */
export function PanelMuhur({ label }: { label: string }) {
  const palet = usePalet();
  return (
    <View style={styles.kap}>
      <View style={[styles.muhur, { backgroundColor: palet.sodyumDolgu }]}>
        <Text
          style={[yazi.sticker, { color: palet.sodyumMurekkep }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { alignItems: "flex-end" },
  muhur: {
    borderRadius: r.plaque,
    paddingHorizontal: 8,
    paddingVertical: 3,
    transform: [{ rotate: "-3deg" }],
  },
});
