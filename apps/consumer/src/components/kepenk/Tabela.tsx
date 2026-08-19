import { PixelRatio, StyleSheet, Text, View } from "react-native";
import { r, s, yazi, type Palet } from "../../design/tokens";
import { trUpper } from "../../design/tr-upper";
import { tabelaOlcusu } from "./tabela-olcu";

/**
 * TABELA — the painted sign, at a FIXED Y below the shutter band
 * (spec §3).
 *
 * The plaque carries the two mounting bolts every real Turkish sign has,
 * and the name is real RN `<Text>` over the SVG — never SVG `<Text>`,
 * which Android resolves through its own Typeface lookup and silently
 * falls back to Roboto, taking the drawn ğ and İ with it (§5.5).
 *
 * The name never truncates and never wraps: a fixed Y is worth more than
 * a second line, and a shop sign that cannot fit the shop's name is a
 * broken sign — so the type gives way instead, down to a 14pt floor
 * (see tabela-olcu.ts).
 *
 * That fit is done at the size the letters are DRAWN at, which is the
 * user's text size — not at 1×. The plaque cannot grow (it is on §3's
 * fixed Y inside a drawing whose proportions are the gauge), so at a
 * raised text setting the sign spends the room it has on saying the whole
 * name rather than on bigger letters: short names still grow with the
 * user, long ones hold at the size that fits. The alternative is a sign
 * that says "YELDEĞİRMENİ PA…", which is the very defect this component's
 * measuring exists to prevent.
 */
export function Tabela({
  genislik,
  yukseklik,
  ad,
  palet,
  sonuk = false,
}: {
  genislik: number;
  yukseklik: number;
  ad: string;
  palet: Palet;
  /** Sold out: the sign is unlit. */
  sonuk?: boolean;
}) {
  const plakaYuksekligi = yukseklik - 6;
  const yazit = trUpper(ad);
  // The plaque's inner width: its own 6pt padding, the two 3pt bolts and
  // the 6pt gap each side of the type.
  const icGenislik = genislik - 2 * s.s3 - 12 - 6 - 12;
  const olcu = tabelaOlcusu(yazit, icGenislik, PixelRatio.getFontScale());

  return (
    <View
      style={[styles.alan, { width: genislik, height: yukseklik }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.plaka,
          {
            width: genislik - 2 * s.s3,
            height: plakaYuksekligi,
            backgroundColor: palet.plakaZemin,
            borderColor: palet.plakaCizgi,
          },
        ]}
      >
        <View style={[styles.civata, { backgroundColor: palet.plakaBoltu }]} />
        <Text
          style={[
            yazi.tabelaLg,
            styles.ad,
            {
              fontSize: olcu.boyut,
              lineHeight: olcu.satirYuksekligi,
              color: sonuk ? palet.plakaYaziSonuk : palet.plakaYazi,
            },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={yazi.tabelaLg.maxFontSizeMultiplier}
        >
          {yazit}
        </Text>
        <View style={[styles.civata, { backgroundColor: palet.plakaBoltu }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  alan: { alignItems: "center", justifyContent: "center" },
  plaka: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: r.plaque,
    borderWidth: 1.5,
    paddingHorizontal: 6,
  },
  civata: { width: 3, height: 3, borderRadius: 1.5 },
  ad: { flex: 1, textAlign: "center", marginHorizontal: 6 },
});
