import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { kart, s, yazi } from "../../design/tokens";
import { KapaliKart } from "./KapaliKart";

/**
 * SOKAK — YÜKLENİYOR (spec §4.8).
 *
 * "No skeleton shimmer, ever. The loading state is a list of cards with
 * fully closed shutters and dark tabelas — literally the street before
 * opening." No distance spine here — a distance is real data this frame
 * does not have yet, and this app does not print a number it hasn't
 * earned.
 */
export function SokakYukleniyor({
  kartGenisligi = kart.genislik,
  adet = 4,
}: {
  kartGenisligi?: number;
  adet?: number;
}) {
  const { t } = useTranslation();
  const palet = usePalet();

  return (
    <View
      style={styles.kok}
      accessibilityRole="progressbar"
      accessibilityLabel={t("kesif.yukleniyor")}
    >
      {Array.from({ length: adet }, (_, i) => (
        <KapaliKart key={i} genislik={kartGenisligi} />
      ))}
      <Text style={[yazi.body, styles.altyazi, { color: palet.yaziSis }]}>
        {t("kesif.yukleniyor")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kok: { alignItems: "center", paddingHorizontal: s.s4, gap: kart.aralik, paddingTop: s.s2 },
  altyazi: { marginTop: s.s2, marginBottom: s.s6, textAlign: "center" },
});
