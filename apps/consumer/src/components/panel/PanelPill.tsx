import { StyleSheet, Text, View } from "react-native";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";

type Ton = "notr" | "sodyum" | "tente";

/** A hairline/status pill — complaint status, cancelled/expired order
 * rows. Distinct from `ZamanHapi` (the offer card's own time pill, which
 * this reuses directly where the semantics genuinely match — see
 * OrderRow.tsx) and from `PanelMuhur` (the rotated KURTARILDI stamp, a
 * celebration rather than a status). */
export function PanelPill({ label, ton = "notr" }: { label: string; ton?: Ton }) {
  const palet = usePalet();
  const dolgu =
    ton === "sodyum"
      ? { backgroundColor: palet.sodyumDolgu, borderColor: palet.sodyumDolgu }
      : ton === "tente"
        ? { backgroundColor: palet.tenteDolgu, borderColor: palet.tenteDolgu }
        : { backgroundColor: "transparent", borderColor: palet.cizgiKil };
  const yaziRengi =
    ton === "sodyum" ? palet.sodyumMurekkep : ton === "tente" ? palet.tenteMurekkep : palet.yaziSis;

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
