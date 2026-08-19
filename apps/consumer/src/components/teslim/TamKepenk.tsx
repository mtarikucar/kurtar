import { type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { Defs, Pattern } from "../kepenk/svg-cocuklu";
import { useSvgKimlik } from "../kepenk/svg-kimlik";
import type { Palet } from "../../design/tokens";

/**
 * TAM KEPENK — the full-bleed shutter (spec §4.4 / §4.5).
 *
 * The same object as the card's `<Kepenk/>`, at the size of a shopfront
 * instead of the size of a gauge, and travelling the other way. Shutters
 * go DOWN everywhere in this app, all evening, by themselves; they go UP
 * in exactly two places — purchase confirmation and the redeem swipe —
 * and that inversion is the whole emotional arc of the product (spec §2).
 *
 * `konum` is 0 when the shutter is closed (metal covering everything) and
 * 1 when it has rolled up out of the frame. The caller owns it, because
 * on the redeem screen it is driven by a finger before it is driven by a
 * timing, and on the confirmation screen it is driven by nothing but the
 * clock.
 *
 * The four engineering rules of §2 are unchanged at this size:
 *  1. ONE `<Rect>` filled by a `<Pattern>`, never one node per slat.
 *  2. Only `translateY`, on a group clipped by the container's own
 *     `overflow: hidden` — never the y/height geometry props — and
 *     snapped to whole pixels, because `<Pattern>` tiling seams at
 *     fractional offsets.
 *  3. No timer of its own.
 *  4. The lip is its own antialiased `<Rect>` overlapping the clip edge,
 *     because the lip is the element the eye actually tracks.
 */

/**
 * The corrugation's period. The card's gauge uses 8pt, which is right for
 * a 68pt band; across a whole shopfront the same period reads as
 * pinstripes rather than as steel, so a full-bleed shutter takes a slat
 * closer to the real thing at this apparent distance. Still ONE
 * `<Pattern>`-filled rect either way (§5.3).
 */
const OLUK = 20;

/** The blazing band immediately under the rising lip. */
const CEKIRDEK = 14;
/** How far the light climbs the zinc above the lip … */
const PARLAMA = 44;
/** … and where it stops, so the leading edge stays a crisp dark
 * silhouette against the light behind it. */
const PARLAMA_BOSLUGU = 5;

export function TamKepenk({
  genislik,
  yukseklik,
  konum,
  palet,
  kilitli = false,
  basit = false,
  kol,
  isikVar = true,
}: {
  genislik: number;
  yukseklik: number;
  /** 0 = closed, 1 = rolled up. Owned by the caller. */
  konum: Animated.Value;
  palet: Palet;
  /** Outside the pickup window: a drawn padlock on the metal. */
  kilitli?: boolean;
  /** `deviceYearClass < 2019`: flat fill, flat spill, same movement. */
  basit?: boolean;
  /** The handle. Rides the lip, because that is where a shutter's handle
   * is. */
  kol?: ReactNode;
  /** The confirmation screen wants the flood; a shutter slamming shut on
   * a sold-out offer wants no light at all behind it. */
  isikVar?: boolean;
}) {
  const olukKimlik = useSvgKimlik("tam-oluk");
  const rgb = palet.isikRgb;

  // Whole pixels: a fractional translate seams the pattern tiling.
  const kaydir = konum.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -Math.round(yukseklik)],
  });
  const lipKaydir = Animated.add(kaydir, yukseklik);

  // The light lives through the roll and hands over to the sign at the
  // end of it — it must never compete with the code (spec §4.5).
  const isikOpaklik = konum.interpolate({
    inputRange: [0, 0.12, 0.86, 1],
    outputRange: [0.35, 1, 0.9, 0],
    extrapolate: "clamp",
  });

  return (
    <View
      style={[styles.kap, { width: genislik, height: yukseklik }]}
      pointerEvents={kol ? "box-none" : "none"}
    >
      {isikVar ? (
        <Animated.View
          testID="tam-kepenk-isik"
          pointerEvents="none"
          style={[
            styles.katman,
            {
              width: genislik,
              height: yukseklik,
              opacity: isikOpaklik,
              transform: [{ translateY: lipKaydir }],
            },
          ]}
        >
          {basit ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: palet.isikTasmasiDuz }]}
            />
          ) : (
            <>
              {/* The body of the light, falling away downward off the lip
                  and ending at alpha 0 — never `'transparent'`, which
                  Android interpolates through #00000000 and smudges. */}
              <LinearGradient
                colors={[
                  `rgba(${rgb},0.55)`,
                  `rgba(${rgb},0.20)`,
                  `rgba(${rgb},0)`,
                ]}
                locations={[0, 0.35, 1]}
                style={StyleSheet.absoluteFill}
              />
              {/* The core: the one band brighter than any surface. */}
              <LinearGradient
                colors={[palet.isikCekirdek, `rgba(${rgb},0.3)`]}
                style={[styles.cekirdek, { width: genislik }]}
              />
            </>
          )}
        </Animated.View>
      ) : null}

      <Animated.View
        testID="tam-kepenk-metal"
        style={[
          styles.katman,
          { width: genislik, height: yukseklik, transform: [{ translateY: kaydir }] },
        ]}
      >
        <Svg width={genislik} height={yukseklik}>
          {basit ? null : (
            <Defs>
              <Pattern
                id={olukKimlik}
                x={0}
                y={0}
                width={OLUK}
                height={1}
                patternUnits="userSpaceOnUse"
              >
                <Rect x={0} y={0} width={OLUK / 2} height={1} fill={palet.metalAcik} />
                <Rect
                  x={OLUK / 2}
                  y={0}
                  width={OLUK / 2}
                  height={1}
                  fill={palet.metalKoyu}
                />
              </Pattern>
            </Defs>
          )}
          <Rect
            x={0}
            y={0}
            width={genislik}
            height={yukseklik}
            fill={basit ? palet.metalCinko : `url(#${olukKimlik})`}
          />
          <Line
            x1={Math.round(genislik * 0.3)}
            y1={0}
            x2={Math.round(genislik * 0.3)}
            y2={yukseklik}
            stroke={palet.kepenkDikey}
            strokeWidth={1}
          />
          <Line
            x1={Math.round(genislik * 0.72)}
            y1={0}
            x2={Math.round(genislik * 0.72)}
            y2={yukseklik}
            stroke={palet.kepenkDikey}
            strokeWidth={1}
          />
          {kilitli ? (
            <Path
              d={asmaKilit(genislik / 2, yukseklik * 0.42)}
              stroke={palet.metalDudak}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}
          <Rect x={0} y={yukseklik - 5} width={genislik} height={1} fill={palet.kepenkDudakIsik} />
          <Rect x={0} y={yukseklik - 4} width={genislik} height={4} fill={palet.metalDudak} />
        </Svg>

        {kol ? <View style={styles.kol}>{kol}</View> : null}
      </Animated.View>

      {/* Light landing ON the metal above the gap, drawn after the
          shutter: a lamp behind a steel slat still lights the slat, and
          without it the opening reads as a shadow rather than a light. */}
      {isikVar && !basit ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.parlama,
            {
              width: genislik,
              height: PARLAMA,
              opacity: isikOpaklik,
              transform: [{ translateY: lipKaydir }],
            },
          ]}
        >
          <LinearGradient
            colors={[`rgba(${rgb},0)`, `rgba(${rgb},0.45)`]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * A drawn padlock — the shutter is bolted outside the pickup window
 * (spec §4.5 Guards). One path, no text, no asset.
 */
export function asmaKilit(x: number, y: number): string {
  const g = 40;
  const govdeY = y;
  const sol = x - g / 2;
  return [
    `M${sol} ${govdeY} h${g} v${g * 0.82} h${-g} Z`,
    `M${sol + g * 0.22} ${govdeY} v${-g * 0.34}`,
    `a${g * 0.28} ${g * 0.28} 0 0 1 ${g * 0.56} 0`,
    `v${g * 0.34}`,
  ].join(" ");
}

const styles = StyleSheet.create({
  kap: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  katman: { position: "absolute", left: 0, top: 0 },
  cekirdek: { position: "absolute", left: 0, top: 0, height: CEKIRDEK },
  parlama: { position: "absolute", left: 0, top: -(PARLAMA + PARLAMA_BOSLUGU) },
  // The handle sits ON the lip, which is where a shutter's handle is.
  kol: { position: "absolute", left: 0, right: 0, bottom: 8 },
});
