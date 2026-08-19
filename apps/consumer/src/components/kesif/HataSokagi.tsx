import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { Kepenk } from "../kepenk";
import { usePalet } from "../../design/theme";
import { kart, r, s, yazi } from "../../design/tokens";

const KAGIT_GENISLIK = 220;
const KAGIT_YUKSEKLIK = 56;

/**
 * SOKAK — HATA (spec §4.8): "a half-lowered shutter with a paper note
 * taped across it at 2°, mono type: `Bağlantı yok — tekrar dene`. The
 * paper is [the other] place in the app anything is rotated [next to the
 * TÜKENDİ sticker in §3], and it is a single non-text-bearing SVG group"
 * — the rotated node is the paper rectangle; the retry copy is real RN
 * `<Text>` on top of it (§5.5: never SVG `<Text>`), rotating together with
 * it inside one `View`.
 */
export function HataSokagi({
  kartGenisligi = kart.genislik,
  onTekrarDene,
}: {
  kartGenisligi?: number;
  onTekrarDene: () => void;
}) {
  const { t } = useTranslation();
  const palet = usePalet();

  return (
    <Pressable
      onPress={onTekrarDene}
      accessibilityRole="button"
      accessibilityLabel={t("kesif.hata")}
      style={({ pressed }) => [styles.kok, pressed ? { opacity: 0.9 } : null]}
    >
      <View
        style={[
          styles.serit,
          { width: kartGenisligi, backgroundColor: palet.vitrinZemin, borderRadius: r.card },
        ]}
      >
        <Kepenk
          genislik={kartGenisligi}
          band={kart.band}
          p={0.5}
          guc={0}
          glyph="kafe"
          palet={palet}
          azaltHareket
          girisYap={false}
        />
      </View>

      <View style={styles.kagitSarici}>
        <Svg
          width={KAGIT_GENISLIK}
          height={KAGIT_YUKSEKLIK}
          style={[styles.kagit]}
        >
          <Rect
            x={0}
            y={0}
            width={KAGIT_GENISLIK}
            height={KAGIT_YUKSEKLIK}
            fill={palet.plakaZemin}
            stroke={palet.plakaCizgi}
            strokeWidth={1}
          />
        </Svg>
        <Text
          style={[yazi.data, styles.metin, { color: palet.plakaYazi }]}
          maxFontSizeMultiplier={1.3}
        >
          {t("kesif.hata")}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kok: { alignItems: "center", paddingVertical: s.s8 },
  serit: { overflow: "hidden" },
  kagitSarici: {
    position: "absolute",
    top: kart.tente + kart.band / 2 - KAGIT_YUKSEKLIK / 2,
    width: KAGIT_GENISLIK,
    height: KAGIT_YUKSEKLIK,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "2deg" }],
  },
  kagit: { position: "absolute", left: 0, top: 0 },
  metin: { paddingHorizontal: s.s3, textAlign: "center" },
});
