import { StyleSheet, Text, View } from "react-native";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import {
  SPINE_BOSLUK,
  SPINE_ETIKET_GENISLIGI,
  SPINE_HAIRLINE_GENISLIGI,
} from "./duzen";

/**
 * BÖLÜM BAŞLIĞI — a district section header down the street spine (spec
 * §4.1's "── YELDEĞİRMENİ ────" / "── BEŞİKTAŞ …──" mock). The spine's
 * hairline runs straight through it (no distance label here — a section
 * title isn't a distance), so the column reads as one continuous street
 * rather than an interruption.
 */
export function BolumBasligi({ baslik }: { baslik: string }) {
  const palet = usePalet();
  return (
    <View style={styles.satir} accessibilityRole="header">
      <View style={styles.spine}>
        <View style={[styles.hairline, { backgroundColor: palet.cizgiKil }]} />
      </View>
      <Text
        style={[yazi.label, styles.baslik, { color: palet.yaziSis }]}
        maxFontSizeMultiplier={1.3}
      >
        {baslik}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  satir: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: s.s5,
    paddingBottom: s.s2,
  },
  spine: {
    width: SPINE_ETIKET_GENISLIGI + SPINE_BOSLUK + SPINE_HAIRLINE_GENISLIGI,
    alignItems: "flex-end",
  },
  hairline: { width: SPINE_HAIRLINE_GENISLIGI, height: 14 },
  baslik: { marginLeft: SPINE_BOSLUK },
});
