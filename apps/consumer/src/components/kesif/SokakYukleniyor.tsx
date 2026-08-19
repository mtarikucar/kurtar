import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { kart, s, yazi } from "../../design/tokens";
import { KESIF_SAG_KENAR, KESIF_SOL_KENAR } from "./duzen";
import { KapaliKart } from "./KapaliKart";
import { SokakSatiri } from "./SokakSatiri";

/**
 * SOKAK — YÜKLENİYOR (spec §4.8).
 *
 * "No skeleton shimmer, ever. The loading state is a list of cards with
 * fully closed shutters and dark tabelas — literally the street before
 * opening." A distance is real data this frame does not have yet, and
 * this app does not print a number it hasn't earned — but the SPINE
 * COLUMN still has to be there, at the same width, because the loaded
 * list will have one.
 *
 * First pass centred each `KapaliKart` full-width with no spine, so the
 * moment real offers arrived the cards visibly reflowed — a spine
 * appearing under them and the whole column jumping left, which undoes
 * §4.8's own point that loading "is not a lie about layout". Fixed by
 * wrapping each placeholder in the SAME `SokakSatiri` the loaded rows
 * use (`mesafeM: null` — hairline, no number) at the SAME horizontal
 * inset as the list (`KESIF_SOL_KENAR` / `KESIF_SAG_KENAR`), so a card's
 * x-position never moves when data lands; only its shutter does.
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
        <SokakSatiri key={i} mesafeM={null}>
          <KapaliKart genislik={kartGenisligi} />
        </SokakSatiri>
      ))}
      <Text style={[yazi.body, styles.altyazi, { color: palet.yaziSisZemin }]}>
        {t("kesif.yukleniyor")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kok: {
    paddingLeft: KESIF_SOL_KENAR,
    paddingRight: KESIF_SAG_KENAR,
    gap: kart.aralik,
    paddingTop: s.s2,
  },
  altyazi: { marginTop: s.s2, marginBottom: s.s6, textAlign: "center", paddingHorizontal: s.s4 },
});
