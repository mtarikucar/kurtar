import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { YERLI_SURUCU } from "../../design/motion";
import { useSaniyeTiki } from "../../design/saat";
import { s, yazi, type Palet } from "../../design/tokens";
import { formatClockWithSeconds } from "../../lib/format";

/**
 * The clock, and the two things that prove it is a clock (spec §4.5).
 *
 * A stranger behind a counter has three seconds and bad lighting, and the
 * one thing they are trained to check is that this is not a screenshot.
 * Three proofs carry that, and this component owns two of them:
 *
 *  1. **The clock itself** — 56pt Chivo Mono, tabular by construction
 *     (a monospaced face makes tabular the default on both platforms,
 *     with no `fontVariant` feature flag that Android may ignore), the
 *     seconds swapping on a HARD 1Hz tick. A tweened clock looks
 *     rendered; a hard tick looks like a clock. It is EXEMPT from reduced
 *     motion — it is proof, not decoration.
 *  2. **The nabız** — a 3pt ivory bar sweeping the sign once per second,
 *     in phase with the seconds digit. This is the trained tell, and it
 *     is trained operationally: the merchant's printed counter card says
 *     "Tarama çubuğu akmıyorsa ekran görüntüsüdür." A busy stranger
 *     verifies a MOVEMENT at a metre far faster than they compare two
 *     timestamps.
 *
 * Under reduced motion the sweep becomes a DISCRETE state change — a
 * sodium ring advancing one 6° notch per second — which is still
 * unmistakably alive at a metre and is not an animation at all.
 */
export function CanliSaat({
  genislik,
  palet,
  azaltHareket,
}: {
  genislik: number;
  palet: Palet;
  azaltHareket: boolean | null;
}) {
  const { t } = useTranslation();
  const ms = useSaniyeTiki();
  const an = new Date(ms);
  const yuz = formatClockWithSeconds(an);

  return (
    <View style={styles.kap}>
      <Text
        testID="kepenk-saat"
        style={[yazi.clock, { color: palet.yaziAnaCukur }]}
        // Announced ON REQUEST, never as a polite live region every
        // second — a screen reader that reads the clock aloud once a
        // second is unusable at a counter (spec §4.5).
        accessibilityLabel={t("kepenk.saatErisim", { saat: yuz })}
        // The 1.6 ceiling and nothing else. `allowFontScaling={false}`
        // used to sit here too and won, which made the ceiling dead code
        // and left the app's own proof-of-liveness as the single element
        // on the screen that ignored the user's text size (§1.2:
        // "allowFontScaling stays true everywhere").
        maxFontSizeMultiplier={yazi.clock.maxFontSizeMultiplier}
      >
        {yuz}
      </Text>
      {azaltHareket === true ? (
        <NabizHalkasi saniye={an.getSeconds()} palet={palet} />
      ) : (
        <NabizCubugu genislik={genislik} ms={ms} palet={palet} />
      )}
    </View>
  );
}

/** The sweep. Re-armed by the same 1Hz rail that drives the digits, so it
 * cannot drift out of phase with the seconds. */
function NabizCubugu({
  genislik,
  ms,
  palet,
}: {
  genislik: number;
  ms: number;
  palet: Palet;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const cubuk = Math.max(48, Math.round(genislik * 0.22));

  useEffect(() => {
    x.setValue(0);
    const suzulme = Animated.timing(x, {
      toValue: 1,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: YERLI_SURUCU,
    });
    suzulme.start();
    // Stopped on the next tick and on unmount: an animation still running
    // after its component is gone is a frame loop nobody is watching.
    return () => suzulme.stop();
  }, [ms, x]);

  return (
    <View
      testID="kepenk-nabiz"
      style={[styles.ray, { width: genislik }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          styles.cubuk,
          {
            width: cubuk,
            backgroundColor: palet.yaziAnaCukur,
            transform: [
              {
                translateX: x.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-cubuk, genislik],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

/** 60 notches, one lit per second: a state change, not an animation. */
export const NOTA_ACISI = 6;

function NabizHalkasi({ saniye, palet }: { saniye: number; palet: Palet }) {
  const boy = 34;
  const yaricap = 14;
  const cevre = 2 * Math.PI * yaricap;
  const dolu = (cevre * (saniye % 60)) / 60;

  return (
    <View
      testID="kepenk-nabiz-halkasi"
      style={styles.halkaYuvasi}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={boy} height={boy}>
        <Circle
          cx={boy / 2}
          cy={boy / 2}
          r={yaricap}
          stroke={palet.cubukRay}
          strokeWidth={3}
          fill="none"
        />
        <Circle
          cx={boy / 2}
          cy={boy / 2}
          r={yaricap}
          stroke={palet.sodyumDolgu}
          strokeWidth={3}
          strokeLinecap="butt"
          fill="none"
          strokeDasharray={`${dolu} ${cevre}`}
          transform={`rotate(-90 ${boy / 2} ${boy / 2})`}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { alignItems: "center" },
  ray: { height: 3, marginTop: s.s2, overflow: "hidden" },
  cubuk: { height: 3, borderRadius: 1.5 },
  halkaYuvasi: { marginTop: s.s2, alignItems: "center" },
});
