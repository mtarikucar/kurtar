import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSimdi } from "../../design/saat";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import { trUpper } from "../../design/tr-upper";
import { formatClockTime } from "../../lib/format";

/**
 * BAŞLIK — the discovery header (spec §4.1: "◉ KADIKÖY ▾  18:34  ☰",
 * 52pt, "data clock (minute only)").
 *
 * The hamburger menu in the spec's mock has no destination this track
 * owns (profile/settings belong to Track C) — dropped rather than wired
 * to a screen nobody asked for; see build log §4.
 */
export function Baslik({
  bolgeAdi,
  onBolgeDegistir,
}: {
  bolgeAdi: string;
  onBolgeDegistir: () => void;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  const simdi = useSimdi();

  return (
    <View style={styles.satir}>
      <Pressable
        onPress={onBolgeDegistir}
        accessibilityRole="button"
        accessibilityLabel={t("kesif.konumDegistir")}
        hitSlop={8}
        style={({ pressed }) => [styles.konum, pressed ? { opacity: 0.7 } : null]}
      >
        <Ionicons name="location" size={16} color={palet.sodyumDolgu} />
        <Text style={[yazi.title, { color: palet.yaziAnaZemin }]} numberOfLines={1}>
          {trUpper(bolgeAdi)}
        </Text>
        <Ionicons name="chevron-down" size={14} color={palet.yaziSisZemin} />
      </Pressable>

      <Text
        style={[yazi.data, { color: palet.yaziSisZemin }]}
        maxFontSizeMultiplier={1.3}
        accessibilityLabel={formatClockTime(simdi)}
      >
        {formatClockTime(simdi)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  satir: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: s.s4,
  },
  konum: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    minHeight: 44,
  },
});
