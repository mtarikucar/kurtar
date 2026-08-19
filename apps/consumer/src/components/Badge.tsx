import { StyleSheet, Text, View } from "react-native";
import { usePalet } from "../design/theme";
import { r, s, yazi } from "../design/tokens";

/**
 * `sodyum` — the shop's lamp is on: a sodium fill with `#12181F` ink.
 * `tente` — an alarm: the awning-red fill, again with dark ink, because
 * red is never type on a surface (§1.1). `notr` — a hairline pill in the
 * card's secondary ink, for a fact that is merely true.
 *
 * There is no "success" tone, and there will not be one: rescue in this
 * app is expressed as LIGHT, and every food-waste competitor on earth is
 * green (§1.1 / §5.9).
 */
type Ton = "sodyum" | "tente" | "notr";

/**
 * A status mark on a card. The Track C sibling of this object is
 * `panel/PanelPill`, which carries the same three tones on the orders
 * list; this one serves the screens outside that track. They should be
 * collapsed into one component the next time either is touched.
 */
export function Badge({ label, ton = "notr" }: { label: string; ton?: Ton }) {
  const palet = usePalet();

  const dolgu =
    ton === "sodyum"
      ? { backgroundColor: palet.sodyumDolgu, borderColor: palet.sodyumDolgu }
      : ton === "tente"
        ? { backgroundColor: palet.tenteDolgu, borderColor: palet.tenteDolgu }
        : { borderColor: palet.cizgiKil };

  const yaziRengi =
    ton === "sodyum"
      ? palet.sodyumMurekkep
      : ton === "tente"
        ? palet.tenteMurekkep
        : palet.yaziSis;

  return (
    <View style={[styles.hap, dolgu]}>
      <Text
        style={[yazi.data, { color: yaziRengi }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hap: {
    minHeight: 20,
    borderRadius: r.pill,
    borderWidth: 1,
    paddingHorizontal: s.s2,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
});
