import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { egri, YERLI_SURUCU } from "../../design/motion";
import { m, r, s, yazi, type Palet } from "../../design/tokens";
import { ACIL_DK, sureMetni, type KepenkDurumu } from "./olcum";

/**
 * ZAMAN HAPI — the number welded to the shutter's lip (spec §3).
 *
 * The redundancy law: every shape-encoded quantity carries its literal
 * number in the same fixed physical location. The glyph and the number
 * teach each other in the first two seconds; from session two the number
 * is redundant and the shape does the work.
 *
 * Under 30 minutes the pill flips to awning red with dark ink — ONE 300ms
 * cross-fade and ONE Warning haptic, never a pulse.
 */
export function ZamanHapi({
  durum,
  kalanDk,
  acilisSaati,
  palet,
  azaltHareket,
}: {
  durum: KepenkDurumu;
  kalanDk: number;
  /** "18:30'da" — already carrying its Turkish locative suffix. */
  acilisSaati: string;
  palet: Palet;
  azaltHareket: boolean | null;
}) {
  const { t } = useTranslation();
  const acil = durum === "acik" && kalanDk < ACIL_DK;

  const metin = (() => {
    if (durum === "acilmadi") return t("vitrin.acilis", { saat: acilisSaati });
    if (acil) return t("vitrin.sonDk", { dk: kalanDk });
    const { saat, dakika } = sureMetni(kalanDk);
    if (saat === 0) return t("vitrin.kalanDk", { dk: dakika });
    // "3 sa 0 dk" is a machine talking; a shop says "3 sa".
    return dakika === 0
      ? t("vitrin.kalanSaatTam", { saat })
      : t("vitrin.kalanSaat", { saat, dk: dakika });
  })();

  // The outgoing pill fades out over the incoming one, so the layout is
  // always the ACTIVE variant's — a 300ms cross-fade, and the geometry
  // never jumps.
  const oncekiAcil = useRef(acil);
  const gecis = useRef(new Animated.Value(0)).current;
  const solan = useRef(false);

  useEffect(() => {
    if (oncekiAcil.current === acil) return;
    oncekiAcil.current = acil;
    solan.current = true;
    if (azaltHareket !== false) {
      gecis.setValue(0);
      solan.current = false;
      return;
    }
    gecis.setValue(1);
    Animated.timing(gecis, {
      toValue: 0,
      duration: m.hapFlip,
      easing: egri.fast,
      useNativeDriver: YERLI_SURUCU,
    }).start(() => {
      solan.current = false;
    });
  }, [acil, azaltHareket, gecis]);

  // The one haptic on this screen, and it fires once, on the crossing —
  // never on first render, and never as a repeat.
  const ilkRef = useRef(true);
  useEffect(() => {
    if (ilkRef.current) {
      ilkRef.current = false;
      return;
    }
    if (!acil || Platform.OS === "web") return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => undefined,
    );
  }, [acil]);

  const alarmStil = {
    backgroundColor: palet.tenteDolgu,
    borderColor: palet.tenteDolgu,
  };
  const sakinStil = {
    backgroundColor: palet.hapZemin,
    borderColor: palet.hapCizgi,
  };

  return (
    <View style={styles.kap}>
      <View style={[styles.hap, acil ? alarmStil : sakinStil]}>
        <Text
          style={[
            acil ? yazi.cipAlarm : yazi.data,
            { color: acil ? palet.tenteMurekkep : palet.hapYazi },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {metin}
        </Text>
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.hap,
          acil ? sakinStil : alarmStil,
          { opacity: gecis },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { minWidth: 68 },
  hap: {
    minWidth: 68,
    height: 20,
    borderRadius: r.pill,
    borderWidth: 1,
    paddingHorizontal: s.s2,
    alignItems: "center",
    justifyContent: "center",
  },
});
