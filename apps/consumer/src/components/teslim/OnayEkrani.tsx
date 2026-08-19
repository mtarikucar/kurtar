import { useEffect, useRef, useState } from "react";
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
import { m, s, yazi } from "../../design/tokens";
import { fiyatMetni } from "../kepenk/olcum";
import { AcikDukkan } from "./AcikDukkan";
import { HeroTabela } from "./HeroTabela";
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
  gun,
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
  /**
   * The pickup DAY, `null` when it is today. Discovery filters on
   * `pickupEndAt` alone, so a bag published today for tomorrow's window
   * is listed and buyable — and this ticket used to tell whoever bought
   * one to collect it "BUGÜN". Already uppercased by the caller (through
   * trUpper, never toUpperCase).
   */
  gun: string | null;
  onKepengiAc: () => void;
  onSiparisler: () => void;
  azaltHareket: boolean | null;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  const { width, height } = useWindowDimensions();
  const konum = useRef(new Animated.Value(0)).current;
  const fis = useRef(new Animated.Value(0)).current;
  // The sign is dark until the metal has finished moving: §4.4's order is
  // the roll, THEN the lit tabela settling, then the ticket.
  const [yanik, setYanik] = useState(false);

  useEffect(() => {
    if (azaltHareket === null) return;
    const isikYandi = () => {
      setYanik(true);
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
      {/* The shop the shutter has just uncovered. Drawn first, because
          everything on this screen is inside it. */}
      <AcikDukkan genislik={width} yukseklik={height} palet={palet} />

      <SafeAreaView style={styles.kok} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.govde}>
          <HeroTabela
            ad={dukkanAdi}
            palet={palet}
            yanik={yanik}
            genislik={width - 2 * s.s5}
            testIDOneki="onay"
          />

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
              style={[yazi.paket, styles.satir, { color: palet.yaziAnaCukur }]}
              maxFontSizeMultiplier={1.4}
            >
              {[paketAdi, t("payment.adet", { adet })]
                .filter((parca): parca is string => Boolean(parca))
                .join(" \u00b7 ")}
            </Text>
            <Text
              style={[yazi.dataLg, styles.satir, { color: palet.sodyumYaziCukur }]}
              maxFontSizeMultiplier={1.3}
            >
              {t("payment.odendi", { fiyat: fiyatMetni(toplamKurus), kod })}
            </Text>
            <Text
              style={[yazi.body, styles.satir, styles.bosluk, { color: palet.yaziAnaCukur }]}
              maxFontSizeMultiplier={1.4}
            >
              {gun === null
                ? t("payment.arasindaAl", { pencere })
                : t("payment.arasindaAlTarihli", { pencere, tarih: gun })}
            </Text>
            <Text
              style={[yazi.body, styles.satir, { color: palet.yaziSisCukur }]}
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
            zemin="cukur"
            testID="onay-kepengi-ac"
          />
          <View style={styles.ikincil}>
            <Dugme
              etiket={t("dugme.siparisiGor")}
              onPress={onSiparisler}
              palet={palet}
              ikincil
              zemin="cukur"
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
  // The sign is at the TOP of a shopfront, above the opening, on every
  // other surface in this app; a confirmation that centres it puts the
  // shop's own architecture upside down and leaves the lintel empty.
  // Sign, then the ticket under it, then the room, then the action on
  // the counter.
  govde: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: s.s5,
    paddingTop: s.s8,
    gap: s.s6,
  },
  fis: { alignItems: "center", gap: s.s1 },
  satir: { textAlign: "center" },
  bosluk: { marginTop: s.s3 },
  eylem: { paddingHorizontal: s.s4, paddingBottom: s.s4, gap: s.s3 },
  ikincil: { marginTop: s.s2 },
});
