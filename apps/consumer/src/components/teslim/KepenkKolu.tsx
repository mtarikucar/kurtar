import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { YERLI_SURUCU } from "../../design/motion";
import { m, r, s, yazi, type Palet } from "../../design/tokens";
import {
  KALDIRMA_ESIGI,
  KOL_YUKSEKLIGI,
  YARDIM_ESIGI,
  direncliMesafe,
  kaldirmaMesafesi,
  kaldirmaYeterli,
} from "./perde";

/** The reduced-motion substitute: a 600ms press-and-hold, sodium filling
 * the handle. The ritual survives, the movement doesn't (spec §2). */
const BASILI_TUT_SURESI = 600;

/**
 * KEPENGİ KALDIR — the handle on the lip (spec §4.5).
 *
 * Three ways in, and none of them is optional:
 *  • the drag, ≥140pt up, which is the ritual;
 *  • a 600ms press-and-hold under reduced motion, keeping every haptic;
 *  • a plain button under VoiceOver/TalkBack, and a plain text button for
 *    everybody after two failed drags — a gesture is NEVER the only path.
 *
 * Outside the pickup window it is bolted: the drag still moves, because a
 * dead control reads as a broken screen, but it fights back on a
 * hyperbolic curve and can never reach the threshold.
 */
export function KepenkKolu({
  genislik,
  yukseklik,
  konum,
  palet,
  kilitli,
  kilitAltEtiketi,
  azaltHareket,
  ekranOkuyucu,
  onKaldir,
  onKilitliDeneme,
}: {
  genislik: number;
  /** The shutter's full travel, so a finger moves the metal 1:1 in points
   * — a shutter follows your hand, it does not follow a percentage. */
  yukseklik: number;
  konum: Animated.Value;
  palet: Palet;
  kilitli: boolean;
  /** What to say instead of "swipe up" when the shutter is bolted — an
   * instruction that does not work is worse than no instruction. */
  kilitAltEtiketi?: string;
  azaltHareket: boolean | null;
  ekranOkuyucu: boolean;
  onKaldir: () => void;
  onKilitliDeneme: () => void;
}) {
  const { t } = useTranslation();
  const [basarisiz, setBasarisiz] = useState(0);
  const dolum = useRef(new Animated.Value(0)).current;
  const basiliTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dolumAnimasyonu = useRef<Animated.CompositeAnimation | null>(null);

  // Reduced motion is not yet known on the very first render; until it
  // is, the drag is the safe assumption — it is the path that works in
  // every mode, and the press-and-hold takes over the moment the platform
  // answers `true`.
  const basiliTut = azaltHareket === true;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !basiliTut && !ekranOkuyucu,
        onMoveShouldSetPanResponder: (_e, hareket) =>
          !basiliTut && !ekranOkuyucu && Math.abs(hareket.dy) > 2,
        onPanResponderMove: (_e, hareket) => {
          const piksel = kilitli
            ? direncliMesafe(hareket.dy)
            : kaldirmaMesafesi(hareket.dy);
          konum.setValue(piksel / yukseklik);
        },
        onPanResponderRelease: (_e, hareket) => {
          if (!kilitli && kaldirmaYeterli(hareket.dy)) {
            onKaldir();
            return;
          }
          if (kilitli) onKilitliDeneme();
          else setBasarisiz((sayi) => sayi + 1);
          Animated.timing(konum, {
            toValue: 0,
            duration: m.fast,
            easing: Easing.out(Easing.quad),
            useNativeDriver: YERLI_SURUCU,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.timing(konum, {
            toValue: 0,
            duration: m.fast,
            easing: Easing.out(Easing.quad),
            useNativeDriver: YERLI_SURUCU,
          }).start();
        },
      }),
    [
      basiliTut,
      ekranOkuyucu,
      kilitli,
      konum,
      onKaldir,
      onKilitliDeneme,
      yukseklik,
    ],
  );

  useEffect(
    () => () => {
      if (basiliTimer.current !== null) clearTimeout(basiliTimer.current);
      dolumAnimasyonu.current?.stop();
    },
    [],
  );

  const basmayaBasla = () => {
    if (kilitli) {
      onKilitliDeneme();
      return;
    }
    dolum.setValue(0);
    dolumAnimasyonu.current = Animated.timing(dolum, {
      toValue: 1,
      duration: BASILI_TUT_SURESI,
      easing: Easing.linear,
      // A width animation cannot take the native driver; it is one view,
      // once, on a screen with nothing else moving.
      useNativeDriver: false,
    });
    dolumAnimasyonu.current.start();
    // The ref is nulled by the timer ITSELF, not only by the release:
    // `clearTimeout` on an already-fired timer is a silent no-op, so
    // without this a completed hold would still look "pending" on
    // `onPressOut` and be counted as a miss.
    basiliTimer.current = setTimeout(() => {
      basiliTimer.current = null;
      onKaldir();
    }, BASILI_TUT_SURESI);
  };

  const basmayiBirak = () => {
    if (basiliTimer.current !== null) {
      clearTimeout(basiliTimer.current);
      basiliTimer.current = null;
      // Lifted before the fill completed — 600ms is longer than it feels.
      // The drag counts exactly this as a failed attempt (see the
      // responder release above), and without it the `Kaldıramıyor
      // musun?` way out could never appear in the one mode where the
      // gesture is hardest: the escape hatch was disabled for precisely
      // the users it exists for.
      if (!kilitli) setBasarisiz((sayi) => sayi + 1);
    }
    dolumAnimasyonu.current?.stop();
    dolumAnimasyonu.current = null;
    dolum.setValue(0);
  };

  const etiket = kilitli ? t("kepenk.kolKilitli") : t("kepenk.kolEtiket");
  const altEtiket = kilitli
    ? (kilitAltEtiketi ?? t("kepenk.kolKilitliAlt"))
    : basiliTut
      ? t("kepenk.kolBasiliTut")
      : t("kepenk.kolAltEtiket");

  const govde = (
    <View
      style={[
        styles.kol,
        {
          width: genislik,
          backgroundColor: palet.hapZemin,
          borderColor: palet.metalCinko,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.dolum,
          {
            backgroundColor: palet.sodyumDolgu,
            opacity: 0.22,
            width: dolum.interpolate({
              inputRange: [0, 1],
              outputRange: [0, genislik],
            }),
          },
        ]}
      />
      <Svg width={34} height={11} style={[styles.oklar]}>
        <Path
          d="M3 9 L11 3 L19 9 M15 9 L23 3 L31 9"
          stroke={palet.hapYazi}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      <Text
        style={[yazi.sticker, { color: palet.hapYazi }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {etiket}
      </Text>
      <Text
        style={[yazi.data, { color: palet.hapYaziSis }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {altEtiket}
      </Text>
    </View>
  );

  // Under a screen reader the gesture is replaced outright — not
  // supplemented — by a plain button with a real activate action.
  if (ekranOkuyucu) {
    return (
      <View style={styles.yuva}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("kepenk.kolErisim")}
          accessibilityState={{ disabled: kilitli }}
          testID="kepenk-kol-dugmesi"
          onPress={kilitli ? onKilitliDeneme : onKaldir}
          style={({ pressed }) => [pressed ? { opacity: m.pressOpacity } : null]}
        >
          {govde}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.yuva}>
      {basiliTut ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("kepenk.kolErisim")}
          accessibilityState={{ disabled: kilitli }}
          testID="kepenk-kol-basili"
          onPressIn={basmayaBasla}
          onPressOut={basmayiBirak}
          // A press-and-hold cannot be performed by Switch Control, Voice
          // Control or a keyboard at all; without an activate action this
          // `button` role announced a control that does nothing, and no
          // other control on the screen reveals the code (§5.11).
          accessibilityActions={[{ name: "activate" }]}
          onAccessibilityAction={kilitli ? onKilitliDeneme : onKaldir}
        >
          {govde}
        </Pressable>
      ) : (
        <View
          {...panResponder.panHandlers}
          testID="kepenk-kol-suruklenir"
          accessibilityRole="button"
          accessibilityLabel={t("kepenk.kolErisim")}
          accessibilityActions={[{ name: "activate" }]}
          onAccessibilityAction={kilitli ? onKilitliDeneme : onKaldir}
        >
          {govde}
        </View>
      )}

      {/* After two failed drags the app stops making anyone guess, and
          the way out never disappears again. */}
      {basarisiz >= YARDIM_ESIGI && !kilitli ? (
        <Pressable
          accessibilityRole="button"
          testID="kepenk-yardim"
          // 38pt of drawn target — the ONE control on this screen under
          // 44pt, and it is shown only to a customer whose thumb has
          // already missed the shutter twice. 6pt of slop takes the
          // effective target to 50 and moves no pixel, so the handle does
          // not jump when the button appears.
          hitSlop={6}
          onPress={onKaldir}
          style={({ pressed }) => [
            styles.yardim,
            pressed ? { opacity: m.pressOpacity } : null,
          ]}
        >
          <Text style={[yazi.bodyStrong, { color: palet.hapYazi }]}>
            {t("kepenk.yardim")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export { KALDIRMA_ESIGI };

const styles = StyleSheet.create({
  yuva: { alignItems: "center" },
  kol: {
    height: KOL_YUKSEKLIGI,
    borderRadius: r.cta,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    gap: 1,
  },
  dolum: { position: "absolute", left: 0, top: 0, bottom: 0 },
  oklar: { marginBottom: 1 },
  yardim: { marginTop: s.s3, paddingVertical: s.s2, paddingHorizontal: s.s4 },
});
