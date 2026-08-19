import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { RadialGradient, Rect, Stop } from "react-native-svg";
import { Defs } from "../kepenk/svg-cocuklu";
import { useSvgKimlik } from "../kepenk/svg-kimlik";
import type { Palet } from "../../design/tokens";
import {
  ESIK,
  isikRengi,
  LAMBA,
  tavanKonumlari,
  tavanRenkleri,
  TEZGAH,
} from "./dukkan-isigi";

/**
 * AÇIK DÜKKÂN — the lit interior a rolled-up shutter leaves behind
 * (spec §4.4 / §4.5).
 *
 * Shutters go DOWN everywhere in this app, all evening, by themselves.
 * They go UP in exactly two places — purchase confirmation and the redeem
 * swipe — and that inversion is the entire emotional arc of the product
 * (spec §2): everything is closing, and you made one thing open. The
 * payoff of that inversion is what is behind the metal, so the vacated
 * area cannot be the app's ground with the shutter subtracted from it.
 * You are looking INTO a shop that is open for you.
 *
 * This is the offer card's light fix at the size of a shopfront. On the
 * card the opening emits, the light falls on the metal and on the sign,
 * and a narrowing gap reads HOTTER rather than dimmer; here the same lamp
 * is seen through a doorway instead of through a slit, so it is the whole
 * room that is warm rather than one blazing band.
 *
 * Four layers, and no timeline of their own — the shutter in front is
 * what moves, and the room is simply lit whenever any of it is visible:
 *
 *  1. **the lintel and the depth** — brightest immediately inside the
 *     opening, where the lamp hangs, falling away to an AMBIENT FLOOR
 *     rather than to zero, because the back of a lit shop is dim and not
 *     black;
 *  2. **the lamp itself** — a bloom with a source and an edge, so the
 *     room has a direction of light rather than a flat wash over it;
 *  3. **the counter** — light pooling on the surface at the bottom of the
 *     opening, which is where the paperwork and the action sit;
 *  4. **the sill** it stands on. Without a sill a wide-open shop is a
 *     featureless warm rectangle; with one there is a floor.
 *
 * **The ground stays the screen's own.** The card carries a `vitrinZemin`
 * because its interior is visible with the lamp OFF — a shop that has not
 * opened yet, a shop that has sold out. Neither state exists here: on
 * these two screens the interior is only ever seen through a shutter that
 * is going up, which is to say only ever lit. So the whole difference
 * between dead ground and an open shop is carried by light, which is the
 * discipline the direction rests on.
 *
 * The numbers live in `dukkan-isigi.ts`, where they are held to the
 * legibility budget by test rather than by eye.
 */
export function AcikDukkan({
  genislik,
  yukseklik,
  palet,
  basit = false,
}: {
  genislik: number;
  yukseklik: number;
  palet: Palet;
  /** `deviceYearClass < 2019`: one flat fill instead of four layers
   * (spec §2 Degradation). The shop is still lit; it just has no
   * falloff. */
  basit?: boolean;
}) {
  const lambaKimlik = useSvgKimlik("dukkan-lamba");
  const guc = palet.isikSiddeti;

  if (basit) {
    return (
      <View
        testID="acik-dukkan"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.kap,
          { width: genislik, height: yukseklik, backgroundColor: palet.isikTasmasiDuz },
        ]}
      />
    );
  }

  return (
    <View
      testID="acik-dukkan"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.kap, { width: genislik, height: yukseklik }]}
    >
      <LinearGradient
        colors={tavanRenkleri(palet)}
        locations={tavanKonumlari()}
        style={StyleSheet.absoluteFill}
      />

      <Svg width={genislik} height={yukseklik} style={[styles.tam]}>
        <Defs>
          <RadialGradient
            id={lambaKimlik}
            cx="50%"
            cy={`${LAMBA.merkez * 100}%`}
            rx="82%"
            ry={`${LAMBA.yaricap * 100}%`}
            gradientUnits="objectBoundingBox"
          >
            <Stop
              offset="0"
              stopColor={palet.isikCekirdek}
              stopOpacity={LAMBA.cekirdek * guc}
            />
            <Stop
              offset="0.6"
              stopColor={`rgb(${palet.isikRgb})`}
              stopOpacity={LAMBA.kenar * guc}
            />
            <Stop offset="1" stopColor={`rgb(${palet.isikRgb})`} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={genislik}
          height={yukseklik}
          fill={`url(#${lambaKimlik})`}
        />
      </Svg>

      <LinearGradient
        colors={[isikRengi(palet, 0), isikRengi(palet, TEZGAH.alfa)]}
        style={[
          styles.tezgah,
          {
            width: genislik,
            height: Math.max(TEZGAH.enAz, Math.round(yukseklik * TEZGAH.oran)),
          },
        ]}
      />

      {/* The sill takes the light's own core rather than a wash of it: it
          is the one edge in the room the lamp lands on square, and a line
          reads at any luminance — which is what carries the lit interior
          into the day palette, where every wash is a fraction of its
          night self. */}
      <View
        style={[
          styles.esik,
          {
            width: genislik,
            backgroundColor: palet.isikCekirdek,
            opacity: ESIK.opaklik * guc,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  // `StyleSheet.absoluteFill` is a registered-style id, which <Svg>'s
  // style prop does not accept; this is the same rectangle as a plain
  // style object.
  tam: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
  tezgah: { position: "absolute", left: 0, bottom: ESIK.kalinlik },
  esik: { position: "absolute", left: 0, bottom: 0, height: ESIK.kalinlik },
});
