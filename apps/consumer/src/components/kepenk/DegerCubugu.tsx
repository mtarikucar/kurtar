import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { s, yazi, type Palet } from "../../design/tokens";
import { sodyumYazisi, type YaziZemini } from "../../design/zemin";
import { degerDolulugu, katMetni } from "./olcum";

/**
 * DEĞER ÇUBUĞU — the value comparator (spec §3).
 *
 * Filled left-to-right, FULLER = BETTER deal, with its number
 * (`×3,5 değer`) beside it under the redundancy law. There is no
 * struck-through original price anywhere in this app: the live data has no
 * single "was" price, a bag whose contents are a range does not have one,
 * and inventing one to strike is a lie the range already answers (§5.8).
 */
export function DegerCubugu({
  oran,
  palet,
  etiket = true,
  zemin = "kart",
}: {
  oran: number;
  palet: Palet;
  /** Only the label reads this — the bar and its track are fills. Both
   * shipping callers put the bar on a card with `etiket={false}`; the
   * labelled form exists on the /vitrin review strip, which is street. */
  zemin?: YaziZemini;
  /** On the offer card the number rides the price row, one line above,
   * so the bar itself spans the full width at its 4pt height. The
   * redundancy law is about the number being in a FIXED place next to the
   * shape, not about which row it sits on. */
  etiket?: boolean;
}) {
  const { t } = useTranslation();
  const dolu = degerDolulugu(oran);

  return (
    <View style={styles.satir}>
      <View style={[styles.ray, { backgroundColor: palet.cubukRay }]}>
        <View
          style={[
            styles.dolgu,
            { width: `${dolu * 100}%`, backgroundColor: palet.sodyumDolgu },
          ]}
        />
      </View>
      {etiket ? (
        <Text
          style={[yazi.micro, styles.etiket, { color: sodyumYazisi(palet, zemin) }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {t("vitrin.kat", { kat: katMetni(oran) })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  satir: { flexDirection: "row", alignItems: "center" },
  ray: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  dolgu: { height: 4 },
  etiket: { marginLeft: s.s2, textAlign: "right" },
});
