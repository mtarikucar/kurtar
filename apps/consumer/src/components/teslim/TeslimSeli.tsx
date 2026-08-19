import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { egri, YERLI_SURUCU } from "../../design/motion";
import { m, s, yazi } from "../../design/tokens";
import { trUpper } from "../../design/tr-upper";

/**
 * TESLİM ALINDI — the handover flood (spec §4.5).
 *
 * Son Işık's full-screen light, relocated to the one moment it belongs
 * to. It cannot happen at the roll, where it would compete with the code;
 * at handover there is nothing left to read, and the phone becoming a
 * lamp is the point. Visible from across a shop, unmistakable to a baker
 * who has served forty people tonight.
 *
 * There is no confetti, no checkmark and no Lottie anywhere near this:
 * celebration in this app is expressed as light level, once (§5.10).
 *
 * Under reduced motion the flood is a discrete state — full brightness,
 * held, then gone — rather than a ramp. It is a lamp being switched on,
 * which is a state change and not an animation.
 */
export function TeslimSeli({
  dukkanAdi,
  paketAdi,
  saat,
  azaltHareket,
  onBitti,
}: {
  dukkanAdi: string;
  paketAdi: string | null;
  /** The frozen instant of handover — proof, not decoration. */
  saat: string;
  azaltHareket: boolean | null;
  onBitti?: () => void;
}) {
  const { t } = useTranslation();
  const parlaklik = useRef(new Animated.Value(0)).current;

  // The callback is held in a ref and kept OUT of the effect's deps. It is
  // the one prop a caller is most likely to pass as an inline arrow, and
  // this component is mounted on a screen that re-renders once a second
  // (redeem's live clock). With `onBitti` in the deps the effect tore the
  // sequence down and restarted it every second: the flood never reached
  // its fade, `finished` never came back true, and the overlay never
  // unmounted — leaving the customer on a full-bleed lamp, at brightness
  // 1.0 with auto-lock off, with the ticket and both buttons sealed behind
  // it and no way out but force-quitting.
  const bittiRef = useRef(onBitti);
  bittiRef.current = onBitti;

  useEffect(() => {
    const sonra = () => bittiRef.current?.();
    if (azaltHareket === true) {
      parlaklik.setValue(1);
      const zamanlayici = setTimeout(() => {
        parlaklik.setValue(0);
        sonra();
      }, m.floodHold);
      return () => clearTimeout(zamanlayici);
    }
    const dizi = Animated.sequence([
      Animated.timing(parlaklik, {
        toValue: 1,
        duration: m.floodIn,
        easing: egri.flood,
        useNativeDriver: YERLI_SURUCU,
      }),
      Animated.delay(m.floodHold),
      Animated.timing(parlaklik, {
        toValue: 0,
        duration: m.floodOut,
        easing: egri.flood,
        useNativeDriver: YERLI_SURUCU,
      }),
    ]);
    dizi.start(({ finished }) => {
      if (finished) sonra();
    });
    return () => dizi.stop();
  }, [azaltHareket, parlaklik]);

  return (
    <Animated.View
      testID="teslim-seli"
      pointerEvents="none"
      style={[styles.sel, { opacity: parlaklik }]}
      accessibilityLiveRegion="assertive"
      accessibilityLabel={t("kepenk.selErisim", {
        dukkan: dukkanAdi,
        saat,
      })}
    >
      <LinearGradient
        colors={["#FFC864", "#FFF1DC"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.icerik}>
        <Text style={[yazi.tabelaXl, styles.baslik]} maxFontSizeMultiplier={1.4}>
          {t("kepenk.teslimAlindi")}
        </Text>
        {/* Capped rather than pinned: the flood is full-bleed and cannot
            scroll, so the frozen time takes the clock's own 1.6 ceiling
            instead of refusing to scale at all (§1.2). */}
        <Text
          style={[yazi.clock, styles.saat]}
          maxFontSizeMultiplier={yazi.clock.maxFontSizeMultiplier}
        >
          {saat}
        </Text>
        <Text style={[yazi.tabelaLg, styles.dukkan]} numberOfLines={2}>
          {trUpper(dukkanAdi)}
        </Text>
        {paketAdi ? (
          <Text style={[yazi.body, styles.paket]} numberOfLines={2}>
            {paketAdi}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** The ink on the flood: the darkest thing in the palette, because
 * everything behind it is now light. */
const MUREKKEP = "#12181F";

const styles = StyleSheet.create({
  sel: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  icerik: { alignItems: "center", paddingHorizontal: s.s6, gap: s.s2 },
  baslik: { color: MUREKKEP, textAlign: "center" },
  saat: { color: MUREKKEP },
  dukkan: { color: MUREKKEP, textAlign: "center" },
  paket: { color: "rgba(18,24,31,0.72)", textAlign: "center" },
});
