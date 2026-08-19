import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import {
  SPINE_BOSLUK,
  SPINE_HAIRLINE_GENISLIGI,
  spineEtiketGenisligi,
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
  const { width } = useWindowDimensions();
  // Same column the rows reserve, so the hairline runs straight through
  // the section title instead of stepping sideways at every heading.
  const kolon = spineEtiketGenisligi(width) + SPINE_BOSLUK + SPINE_HAIRLINE_GENISLIGI;
  return (
    <View style={styles.satir} accessibilityRole="header">
      <View style={[styles.spine, { width: kolon }]}>
        <View style={[styles.hairline, { backgroundColor: palet.cizgiKil }]} />
      </View>
      <Text
        style={[yazi.label, styles.baslik, { color: palet.yaziSisZemin }]}
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
  spine: { alignItems: "flex-end" },
  hairline: { width: SPINE_HAIRLINE_GENISLIGI, height: 14 },
  baslik: { marginLeft: SPINE_BOSLUK },
});
