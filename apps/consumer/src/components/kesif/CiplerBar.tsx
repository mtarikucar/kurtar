import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";
import { KESIF_KATEGORILERI, type KesifKategorisi } from "../../lib/kesif";

const ETIKET_ANAHTARI: Record<KesifKategorisi, string> = {
  TUMU: "kesif.filtreler.tumu",
  FIRIN: "kesif.filtreler.firin",
  PASTANE: "kesif.filtreler.pastane",
  MANAV: "kesif.filtreler.manav",
  KAFE: "kesif.filtreler.kafe",
  MUTFAK: "kesif.filtreler.mutfak",
};

/**
 * CİPLER BAR — the filter chip row (spec §4.1: "horizontal scroll, 36pt,
 * radius 10: TÜMÜ · FIRIN · PASTANE · MANAV · KAFE · MUTFAK").
 */
export function CiplerBar({
  secili,
  onSec,
}: {
  secili: KesifKategorisi;
  onSec: (kategori: KesifKategorisi) => void;
}) {
  const { t } = useTranslation();
  const palet = usePalet();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.satir}
    >
      {KESIF_KATEGORILERI.map((kategori) => {
        const aktif = kategori === secili;
        return (
          <Pressable
            key={kategori}
            onPress={() => onSec(kategori)}
            accessibilityRole="button"
            accessibilityState={{ selected: aktif }}
            testID={`kesif-cip-${kategori}`}
            // The chip's own visual height is the spec's 36pt (§4.1); the
            // touch target is widened to the 44pt a11y floor without
            // changing how it looks, same technique ZamanHapi/StokCipi's
            // 18-20pt visual pills would need if they were interactive.
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [
              styles.cip,
              {
                backgroundColor: aktif ? palet.sodyumDolgu : "transparent",
                borderColor: aktif ? palet.sodyumDolgu : palet.cizgiKil,
              },
              pressed ? { opacity: 0.85 } : null,
            ]}
          >
            <Text
              style={[
                yazi.label,
                { color: aktif ? palet.sodyumMurekkep : palet.yaziSisZemin },
              ]}
              maxFontSizeMultiplier={1.3}
            >
              {t(ETIKET_ANAHTARI[kategori])}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  satir: { flexDirection: "row", gap: s.s2, paddingHorizontal: s.s4 },
  cip: {
    height: 36,
    minWidth: 44,
    paddingHorizontal: s.s4,
    borderRadius: r.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
