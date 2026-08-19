import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { VitrinKarti, type VitrinTeklifi } from "../kepenk/VitrinKarti";
import { YERLI_SURUCU } from "../../design/motion";
import { usePalet } from "../../design/theme";
import { kart, s, yazi } from "../../design/tokens";
import { CARPMA_SURESI } from "./perde";
import { TamKepenk } from "./TamKepenk";
import { BolumBasligi, Dugme } from "./ortak";

/**
 * AZ ÖNCE KAPANDI — losing the race at drop time (spec §4.4).
 *
 * `OFFER_UNAVAILABLE` is COMMON, not exceptional: stock is claimed
 * atomically and somebody else's thumb landed first. So this is not a
 * dead-end alert. The shutter slams down over 240ms with one
 * `impactAsync(Heavy)` and a tente-red flash — the same object doing the
 * same thing it does all evening, just faster and in your face — and the
 * nearest alternative is already on screen underneath it.
 *
 * The alternative is a REAL card off the live list, not a link: the
 * decision the customer was two seconds from making is the decision they
 * can still make.
 */
export function KapandiEkrani({
  alternatif,
  onAlternatif,
  onKesfet,
  azaltHareket,
}: {
  alternatif: VitrinTeklifi | null;
  onAlternatif: (teklif: VitrinTeklifi) => void;
  onKesfet: () => void;
  azaltHareket: boolean | null;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  const { width, height } = useWindowDimensions();
  // Starts OPEN and slams shut: the customer was looking at an open shop
  // one frame ago, and the movement is the news.
  const konum = useRef(new Animated.Value(1)).current;
  const flas = useRef(new Animated.Value(0)).current;
  const perdeYuksekligi = Math.round(height * 0.34);

  useEffect(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(
        () => undefined,
      );
    }
    if (azaltHareket !== false) {
      konum.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(konum, {
        toValue: 0,
        duration: CARPMA_SURESI,
        easing: Easing.in(Easing.quad),
        useNativeDriver: YERLI_SURUCU,
      }),
      Animated.sequence([
        Animated.timing(flas, {
          toValue: 1,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: YERLI_SURUCU,
        }),
        Animated.timing(flas, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: YERLI_SURUCU,
        }),
      ]),
    ]).start();
  }, [azaltHareket, flas, konum]);

  return (
    <SafeAreaView
      style={[styles.kok, { backgroundColor: palet.bgAsfalt }]}
      edges={["top", "bottom", "left", "right"]}
      testID="satin-alma-kapandi"
    >
      <View style={[styles.perde, { width, height: perdeYuksekligi }]}>
        <TamKepenk
          genislik={width}
          yukseklik={perdeYuksekligi}
          konum={konum}
          palet={palet}
          isikVar={false}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: palet.tenteDolgu, opacity: flas },
          ]}
        />
      </View>

      <View style={styles.govde}>
        <Text
          style={[yazi.tabelaXl, styles.baslik, { color: palet.yaziAna }]}
          maxFontSizeMultiplier={1.4}
        >
          {t("purchase.kapandiBaslik")}
        </Text>
        <Text
          style={[yazi.body, styles.aciklama, { color: palet.yaziSis }]}
          maxFontSizeMultiplier={1.5}
        >
          {t("purchase.kapandiGovde")}
        </Text>

        {alternatif ? (
          <View style={styles.alternatif}>
            <View style={styles.alternatifBasligi}>
              <BolumBasligi etiket={t("purchase.enYakinAlternatif")} palet={palet} />
            </View>
            <VitrinKarti
              teklif={alternatif}
              genislik={Math.min(width - 2 * s.s4, kart.genislik)}
              onPress={() => onAlternatif(alternatif)}
            />
          </View>
        ) : null}

        <View style={styles.eylem}>
          <Dugme
            etiket={t("dugme.kesfet")}
            onPress={onKesfet}
            palet={palet}
            ikincil={alternatif !== null}
            testID="kapandi-kesfet"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  kok: { flex: 1 },
  perde: { overflow: "hidden" },
  govde: { flex: 1, paddingHorizontal: s.s4, paddingTop: s.s6, gap: s.s3 },
  baslik: { textAlign: "center" },
  aciklama: { textAlign: "center" },
  alternatif: { marginTop: s.s4, alignItems: "center", alignSelf: "stretch" },
  alternatifBasligi: { alignSelf: "stretch" },
  eylem: { marginTop: "auto", paddingBottom: s.s4 },
});
