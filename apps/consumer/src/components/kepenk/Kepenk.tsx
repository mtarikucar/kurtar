import { useEffect, useRef, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { Defs, Pattern } from "./svg-cocuklu";
import { egri, YERLI_SURUCU } from "../../design/motion";
import { m, type Palet } from "../../design/tokens";
import { GLYPH, GLYPH_KUTUSU, type GlyphAnahtari } from "./glyphs";
import { useSvgKimlik } from "./svg-kimlik";

/**
 * KEPENK — the signature (spec §2).
 *
 * Every offer wears a corrugated steel shutter over its shopfront, and how
 * far it has rolled down is how little time is left. Nothing else in the
 * app encodes time; this is the clock. The tabela sits BELOW the band,
 * exactly as on a real Turkish shopfront, which is why the shutter can
 * never touch the shop's name.
 *
 * Four rules hold 60fps on a 720p Android:
 *  1. ONE `<Rect>` filled by a `<Pattern>`, not one node per slat.
 *  2. Only `translateY`, on a clipped group — never the y/height geometry
 *     props, which invalidate the path on Android. Here the clip is the
 *     band's own `overflow: hidden`, so the translate never touches SVG at
 *     all, and the transform is snapped to whole pixels because `<Pattern>`
 *     tiling seams at fractional offsets.
 *  3. One shared clock for the whole list — the caller passes `p`; this
 *     component owns no timer.
 *  4. The bottom lip is its own antialiased `<Rect>` overlapping the clip
 *     boundary, because it is the element the eye actually tracks.
 */
export function Kepenk({
  genislik,
  band,
  p,
  glyph,
  palet,
  azaltHareket,
  isikVar = true,
  basit = false,
  girisYap = true,
  hap,
}: {
  genislik: number;
  band: number;
  /** 0..1, from `kepenkP()`. */
  p: number;
  glyph: GlyphAnahtari;
  palet: Palet;
  azaltHareket: boolean | null;
  /** Sold-out cards lose the light spill: the shop is dark. */
  isikVar?: boolean;
  /** `deviceYearClass < 2019`: flat fill, flat spill, same gauge. */
  basit?: boolean;
  /** The entry roll. Off for a card that is already on screen. */
  girisYap?: boolean;
  /** The time pill, welded to the lip (spec §3). */
  hap?: ReactNode;
}) {
  const olukKimlik = useSvgKimlik("oluk");
  const hedef = -Math.round(band * (1 - p));
  // Entry starts from a fully closed shutter — the same frame the loading
  // state holds (spec §4.8), so a card arriving in the list finishes the
  // movement the empty street started.
  const kaydir = useRef(new Animated.Value(girisYap ? 0 : hedef)).current;
  const ilkRef = useRef(true);

  useEffect(() => {
    // Not yet known: hold the closed frame rather than committing to a
    // movement that may be forbidden.
    if (azaltHareket === null) return;
    const ilk = ilkRef.current;
    ilkRef.current = false;
    if (azaltHareket) {
      // Positions still update — instantly. The information survives, the
      // movement doesn't (spec §2 Degradation).
      kaydir.setValue(hedef);
      return;
    }
    Animated.timing(kaydir, {
      toValue: hedef,
      duration: ilk ? m.base : m.snap,
      easing: ilk ? egri.base : egri.snap,
      useNativeDriver: YERLI_SURUCU,
    }).start();
  }, [azaltHareket, hedef, kaydir]);

  // The spill is anchored to the LIP and falls away downward, not to the
  // top of the band: light comes out of the OPENING. Top-anchored (which
  // is how the spec draws it) puts the bright end behind the metal, where
  // it cannot be seen, and leaves the open vitrin dead black — the one
  // place the card is supposed to look lit. It rides the same value as
  // the shutter, so as the kepenk comes down the light narrows with it.
  const isikKaydir = Animated.add(kaydir, band);

  const olcek = band / GLYPH_KUTUSU;
  const glyphKaydir = (genislik - GLYPH_KUTUSU * olcek) / 2;

  // The pill rides the lip and is clamped to the band, so it can neither
  // ride out of the vitrin at 0.78 nor float above the lintel at 0.08.
  const hapKaydir = kaydir.interpolate({
    inputRange: [-band, 12 - band, -12, 0],
    outputRange: [2, 2, band - 22, band - 22],
    extrapolate: "clamp",
  });

  return (
    <View
      style={[styles.vitrin, { width: genislik, height: band, backgroundColor: palet.vitrinZemin }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {isikVar ? (
        <Animated.View
          style={[
            styles.isik,
            { width: genislik, height: band, transform: [{ translateY: isikKaydir }] },
          ]}
        >
          {basit ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: palet.isikTasmasiDuz }]}
            />
          ) : (
            <LinearGradient
              colors={[palet.isikTasmasi[0], palet.isikTasmasi[1]]}
              style={StyleSheet.absoluteFill}
            />
          )}
        </Animated.View>
      ) : null}

      <Svg width={genislik} height={band} style={[styles.tamKaplama]}>
        <Path
          d={GLYPH[glyph]}
          transform={`translate(${glyphKaydir} 0) scale(${olcek})`}
          stroke={palet.glyphCizgi}
          strokeWidth={1.5 / olcek}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>

      <Animated.View
        style={[
          styles.metal,
          { width: genislik, height: band, transform: [{ translateY: kaydir }] },
        ]}
      >
        <Svg width={genislik} height={band}>
          {basit ? null : (
            <Defs>
              <Pattern
                id={olukKimlik}
                x={0}
                y={0}
                width={8}
                height={1}
                patternUnits="userSpaceOnUse"
              >
                <Rect x={0} y={0} width={4} height={1} fill={palet.metalAcik} />
                <Rect x={4} y={0} width={4} height={1} fill={palet.metalKoyu} />
              </Pattern>
            </Defs>
          )}
          <Rect
            x={0}
            y={0}
            width={genislik}
            height={band}
            fill={basit ? palet.metalCinko : `url(#${olukKimlik})`}
          />
          <Line
            x1={Math.round(genislik * 0.3)}
            y1={0}
            x2={Math.round(genislik * 0.3)}
            y2={band}
            stroke={palet.kepenkDikey}
            strokeWidth={1}
          />
          <Rect x={0} y={band - 4} width={genislik} height={1} fill={palet.kepenkDudakIsik} />
          <Rect x={0} y={band - 3} width={genislik} height={3} fill={palet.metalDudak} />
        </Svg>
      </Animated.View>

      {hap ? (
        <Animated.View style={[styles.hap, { transform: [{ translateY: hapKaydir }] }]}>
          {hap}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  vitrin: { overflow: "hidden" },
  // `StyleSheet.absoluteFill` is a registered-style id, which <Svg>'s
  // style prop does not accept; this is the same rectangle as a plain
  // style object.
  tamKaplama: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
  metal: { position: "absolute", left: 0, top: 0 },
  isik: { position: "absolute", left: 0, top: 0 },
  hap: { position: "absolute", right: 12, top: 0 },
});
