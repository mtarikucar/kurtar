import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { egri, YERLI_SURUCU } from "../../design/motion";
import { usePalet } from "../../design/theme";
import { m, r, s, yazi } from "../../design/tokens";
import { trUpper } from "../../design/tr-upper";
import { fiyatMetni } from "../kepenk/olcum";
import { Dugme } from "./ortak";
import { TamKepenk } from "./TamKepenk";

/** The order ticket slides down after the sign has settled (spec §4.4). */
const FIS_SURESI = 320;

/**
 * SATIN ALMA ONAYI — the first of the app's only two upward rolls
 * (spec §4.4).
 *
 * Full-screen, never a toast. The shutter rolls UP over 700ms, sodium
 * floods behind the rising metal, the sign lights, and the order ticket
 * slides down over it. Everything in this app is closing, all evening, by
 * itself — and you just made one thing open.
 *
 * There is no confetti, no checkmark, no Lottie and no animated price
 * counter (§5.10). Celebration here is a light level, once. The single
 * haptic is `notificationAsync(Success)` at the moment the sign lights,
 * which is the end of the roll and not the start of it.
 */
export function OnayEkrani({
  dukkanAdi,
  paketAdi,
  adet,
  toplamKurus,
  kod,
  pencere,
  onKepengiAc,
  onSiparisler,
  azaltHareket,
}: {
  dukkanAdi: string;
  paketAdi: string | null;
  adet: number;
  /** The SERVER's total, never a client-side multiplication. */
  toplamKurus: number;
  kod: string;
  /** "18:30–21:00" */
  pencere: string;
  onKepengiAc: () => void;
  onSiparisler: () => void;
  azaltHareket: boolean | null;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  const { width, height } = useWindowDimensions();
  const konum = useRef(new Animated.Value(0)).current;
  const fis = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (azaltHareket === null) return;
    const isikYandi = () => {
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
      }
    };

    if (azaltHareket) {
      // Reduced motion: the shutter is simply up and the ticket is simply
      // there. The information survives; the movement doesn't.
      konum.setValue(1);
      fis.setValue(1);
      isikYandi();
      return;
    }

    const dizi = Animated.sequence([
      Animated.timing(konum, {
        toValue: 1,
        duration: m.roll,
        easing: egri.roll,
        useNativeDriver: YERLI_SURUCU,
      }),
      Animated.timing(fis, {
        toValue: 1,
        duration: FIS_SURESI,
        easing: egri.base,
        useNativeDriver: YERLI_SURUCU,
      }),
    ]);
    const zamanlayici = setTimeout(isikYandi, m.roll);
    dizi.start();
    return () => {
      clearTimeout(zamanlayici);
      dizi.stop();
    };
  }, [azaltHareket, fis, konum]);

  return (
    <View
      style={[styles.kok, { backgroundColor: palet.bgDerin }]}
      testID="satin-alma-onayi"
    >
      <SafeAreaView style={styles.kok} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.govde}>
          <View
            style={[
              styles.plaka,
              { backgroundColor: palet.plakaZemin, borderColor: palet.sodyumDolgu },
            ]}
          >
            <View style={[styles.civata, { backgroundColor: palet.plakaBoltu }]} />
            <Text
              style={[yazi.tabelaXl, styles.ad, { color: palet.plakaYazi }]}
              numberOfLines={2}
              maxFontSizeMultiplier={yazi.tabelaXl.maxFontSizeMultiplier}
            >
              {trUpper(dukkanAdi)}
            </Text>
            <View style={[styles.civata, { backgroundColor: palet.plakaBoltu }]} />
          </View>

          <Animated.View
            testID="onay-fisi"
            style={[
              styles.fis,
              {
                opacity: fis,
                transform: [
                  {
                    translateY: fis.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-24, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text
              style={[yazi.paket, styles.satir, { color: palet.yaziAna }]}
              maxFontSizeMultiplier={1.4}
            >
              {[paketAdi, t("payment.adet", { adet })]
                .filter((parca): parca is string => Boolean(parca))
                .join(" \u00b7 ")}
            </Text>
            <Text
              style={[yazi.dataLg, styles.satir, { color: palet.sodyumYazi }]}
              maxFontSizeMultiplier={1.3}
            >
              {t("payment.odendi", { fiyat: fiyatMetni(toplamKurus), kod })}
            </Text>
            <Text
              style={[yazi.body, styles.satir, styles.bosluk, { color: palet.yaziAna }]}
              maxFontSizeMultiplier={1.4}
            >
              {t("payment.arasindaAl", { pencere })}
            </Text>
            <Text
              style={[yazi.body, styles.satir, { color: palet.yaziSis }]}
              maxFontSizeMultiplier={1.4}
            >
              {t("payment.canta")}
            </Text>
          </Animated.View>
        </View>

        <View style={styles.eylem}>
          <Dugme
            etiket={t("dugme.kepengiAc")}
            altEtiket={t("payment.siparislerimde")}
            onPress={onKepengiAc}
            palet={palet}
            testID="onay-kepengi-ac"
          />
          <View style={styles.ikincil}>
            <Dugme
              etiket={t("dugme.siparisiGor")}
              onPress={onSiparisler}
              palet={palet}
              ikincil
              testID="onay-siparis"
            />
          </View>
        </View>
      </SafeAreaView>

      {/* Drawn last so it is genuinely over everything, and pointer-inert
          the moment it has no handle to offer. */}
      <TamKepenk
        genislik={width}
        yukseklik={height}
        konum={konum}
        palet={palet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  kok: { flex: 1 },
  govde: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s.s5,
    gap: s.s6,
  },
  plaka: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    borderRadius: r.plaque,
    borderWidth: 1.5,
    paddingHorizontal: 6,
    paddingVertical: s.s3,
  },
  civata: { width: 3, height: 3, borderRadius: 1.5 },
  ad: { flex: 1, textAlign: "center", marginHorizontal: 6 },
  fis: { alignItems: "center", gap: s.s1 },
  satir: { textAlign: "center" },
  bosluk: { marginTop: s.s3 },
  eylem: { paddingHorizontal: s.s4, paddingBottom: s.s4, gap: s.s3 },
  ikincil: { marginTop: s.s2 },
});
