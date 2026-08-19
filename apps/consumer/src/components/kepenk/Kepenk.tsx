import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { egri, YERLI_SURUCU } from "../../design/motion";
import { m, type Palet } from "../../design/tokens";
import { GLYPH, GLYPH_KUTUSU, type GlyphAnahtari } from "./glyphs";
import { STOK_ALARM_SINIRI, STOK_NOKTA_SINIRI } from "./olcum";
import { Defs, Pattern } from "./svg-cocuklu";
import { useSvgKimlik } from "./svg-kimlik";

/**
 * KEPENK — the signature (spec §2).
 *
 * Every offer wears a corrugated steel shutter over its shopfront, and two
 * things move together underneath it: how far the shutter has come down,
 * and how hard the shop burns. Nothing else in the app encodes time.
 *
 * Four rules hold 60fps on a 720p Android:
 *  1. ONE `<Rect>` filled by a `<Pattern>`, not one node per slat.
 *  2. Only `translateY`, on a clipped group — never the y/height geometry
 *     props, which invalidate the path on Android. Here the clip is the
 *     band's own `overflow: hidden`, so the translate never touches SVG at
 *     all, and the transform is snapped to whole pixels because
 *     `<Pattern>` tiling seams at fractional offsets. Every light layer
 *     rides the SAME animated value, so the whole picture moves as one
 *     object with no second timeline to keep in sync.
 *  3. One shared clock for the whole list — the caller passes `p`; this
 *     component owns no timer.
 *  4. The bottom lip is its own antialiased `<Rect>` overlapping the clip
 *     boundary, because it is the element the eye actually tracks.
 */

/** The blazing gap immediately under the lip. */
const CEKIRDEK_YUKSEKLIGI = 10;
/** How far the light climbs the zinc above the lip. */
const PARLAMA_YUKSEKLIGI = 20;
/** …and where it stops: clear of the 3pt lip and its specular line, so
 * the leading edge stays a crisp dark silhouette against the light behind
 * it. The lip is the element the eye actually tracks (spec §2 rule 4); a
 * bloom painted over it dissolves exactly the line that carries the
 * gauge. */
const PARLAMA_BOSLUGU = 4;
/** A lit package standing on the sill of the window. */
const KUTU_BOYU = 10;
const HALE_BOYU = 22;

export function Kepenk({
  genislik,
  band,
  p,
  guc,
  glyph,
  palet,
  azaltHareket,
  kalanAdet = 0,
  basit = false,
  girisYap = true,
  hap,
}: {
  genislik: number;
  band: number;
  /** 0..1, from `kepenkP()`. */
  p: number;
  /** 0..1, from `isikGucu()`. Zero means the shop is dark — not open yet,
   * or sold out. */
  guc: number;
  glyph: GlyphAnahtari;
  palet: Palet;
  azaltHareket: boolean | null;
  /** Lit packages in the window, bounded to four (spec §3: four is the
   * subitizing limit, past it a dot row is a serial count). */
  kalanAdet?: number;
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
    // Not yet known whether movement is allowed: hold the closed frame
    // rather than committing to a roll that may be forbidden.
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

  // Everything that belongs to the OPENING hangs off the lip and falls
  // away downward, because light comes out of the gap — not out of the
  // top of the band, which is behind the metal where nobody can see it.
  const lipKaydir = Animated.add(kaydir, band);

  const olcek = band / GLYPH_KUTUSU;
  const glyphKaydir = (genislik - GLYPH_KUTUSU * olcek) / 2;

  // The pill rides the lip and is clamped to the band, so it can neither
  // ride out of the vitrin at 0.78 nor float above the lintel at 0.08.
  const hapKaydir = kaydir.interpolate({
    inputRange: [-band, 12 - band, -12, 0],
    outputRange: [2, 2, band - 22, band - 22],
    extrapolate: "clamp",
  });

  // One light on in a nearly-closed shop: the last package breathes.
  const nefes = useRef(new Animated.Value(1)).current;
  const nefesVar = kalanAdet > 0 && kalanAdet <= STOK_ALARM_SINIRI && guc > 0;

  useEffect(() => {
    if (!nefesVar || azaltHareket !== false) {
      nefes.setValue(1);
      return;
    }
    const dongu = Animated.loop(
      Animated.sequence([
        Animated.timing(nefes, {
          toValue: 0.55,
          duration: m.stokNefes / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: YERLI_SURUCU,
        }),
        Animated.timing(nefes, {
          toValue: 1,
          duration: m.stokNefes / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: YERLI_SURUCU,
        }),
      ]),
    );
    dongu.start();
    return () => dongu.stop();
  }, [azaltHareket, nefes, nefesVar]);

  const isik = guc * palet.isikSiddeti;
  const yanik = isik > 0;
  const rgb = palet.isikRgb;
  // Four is the subitizing limit: at or below it every remaining package
  // is a square you can count without counting. Above it there is nothing
  // to count — the window is simply lit, and the chip carries the number.
  const kutular = kalanAdet > 0 && kalanAdet <= STOK_NOKTA_SINIRI ? kalanAdet : 0;

  return (
    <View
      style={[styles.vitrin, { width: genislik, height: band, backgroundColor: palet.vitrinZemin }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {yanik ? (
        <Animated.View
          // The one testID in the signature: whether the shop is emitting
          // is the difference between "not open yet" and "closing in 20
          // minutes", and that is worth asserting rather than eyeballing.
          testID="kepenk-isik"
          style={[
            styles.katman,
            { width: genislik, height: band, transform: [{ translateY: lipKaydir }] },
          ]}
        >
          {basit ? (
            // Old Android: one flat fill instead of two gradients. The
            // gauge — which is the information — is untouched.
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: palet.isikTasmasiDuz, opacity: isik }]}
            />
          ) : (
            <>
              {/* The body of the light. Its last stop is an ambient
                  floor rather than zero, because a wide-open lit shop is
                  lit all the way to the back — the falloff is what makes
                  a narrow gap read hotter than a wide one, and it should
                  not turn the open shop's own interior black. The layer
                  is exactly one band tall and hangs from the lip, so its
                  bottom edge is always at or below the sill and the floor
                  never shows as a seam. */}
              <LinearGradient
                colors={[
                  `rgba(${rgb},${(0.62 * isik).toFixed(3)})`,
                  `rgba(${rgb},${(0.26 * isik).toFixed(3)})`,
                  `rgba(${rgb},${(0.16 * isik).toFixed(3)})`,
                ]}
                locations={[0, 0.4, 1]}
                style={StyleSheet.absoluteFill}
              />
              {/* The core: the one thing on the card brighter than any
                  surface on it. It sits in the gap, so as the shutter
                  comes down the gap fills with core and the card reads
                  hotter, not dimmer. */}
              <LinearGradient
                colors={[palet.isikCekirdek, `rgba(${rgb},${(0.35 * isik).toFixed(3)})`]}
                style={[styles.cekirdek, { width: genislik, opacity: Math.min(1, 0.55 + 0.45 * isik) }]}
              />
            </>
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

      {/* The sill. Without it a wide-open shop is a featureless warm
          rectangle; with it there is a counter for the packages to stand
          on and the opening reads as a window. */}
      {yanik ? (
        <View
          pointerEvents="none"
          style={[
            styles.esik,
            { width: genislik, backgroundColor: `rgba(${rgb},${(0.5 * isik).toFixed(3)})` },
          ]}
        />
      ) : null}

      {/* The packages, lit, standing on that sill. This is the stock count
          as a picture: countable at a glance up to four, brighter than
          anything around them, and covered by the shutter only once it
          reaches the sill — which is the moment there is nothing left to
          sell. */}
      {yanik && kutular > 0 ? (
        <View style={styles.sergi} pointerEvents="none" testID="kepenk-stok-isigi">
          {Array.from({ length: kutular }, (_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.kutuYuvasi,
                nefesVar && i === kutular - 1 ? { opacity: nefes } : null,
              ]}
            >
              <View
                style={[
                  styles.hale,
                  { backgroundColor: `rgba(255,214,150,${(0.42 * isik).toFixed(3)})` },
                ]}
              />
              <View
                style={[
                  styles.icHale,
                  { backgroundColor: `rgba(255,235,196,${(0.55 * isik).toFixed(3)})` },
                ]}
              />
              <View style={styles.kutu} />
            </Animated.View>
          ))}
        </View>
      ) : null}

      <Animated.View
        style={[
          styles.katman,
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

      {/* Light landing ON the metal above the gap — drawn after the
          shutter, because a lamp behind a steel slat still lights the
          slat. This is what stops the slit reading as a shadow. */}
      {yanik && !basit ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.parlama,
            {
              width: genislik,
              height: PARLAMA_YUKSEKLIGI,
              transform: [{ translateY: lipKaydir }],
            },
          ]}
        >
          <LinearGradient
            colors={[`rgba(${rgb},0)`, `rgba(${rgb},${(0.5 * isik).toFixed(3)})`]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}

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
  katman: { position: "absolute", left: 0, top: 0 },
  // `StyleSheet.absoluteFill` is a registered-style id, which <Svg>'s
  // style prop does not accept; this is the same rectangle as a plain
  // style object.
  tamKaplama: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
  cekirdek: { position: "absolute", left: 0, top: 0, height: CEKIRDEK_YUKSEKLIGI },
  parlama: {
    position: "absolute",
    left: 0,
    top: -(PARLAMA_YUKSEKLIGI + PARLAMA_BOSLUGU),
  },
  esik: { position: "absolute", left: 0, bottom: 0, height: 1 },
  sergi: {
    position: "absolute",
    left: 12,
    bottom: 3,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  kutuYuvasi: {
    width: HALE_BOYU,
    height: HALE_BOYU,
    alignItems: "center",
    justifyContent: "center",
  },
  hale: {
    position: "absolute",
    width: HALE_BOYU,
    height: HALE_BOYU,
    borderRadius: 4,
  },
  icHale: {
    position: "absolute",
    width: KUTU_BOYU + 5,
    height: KUTU_BOYU + 5,
    borderRadius: 3,
  },
  // The package itself is the brightest thing on the card — a light, not
  // a lit surface, so it does not take the phase's amber.
  kutu: { width: KUTU_BOYU, height: KUTU_BOYU, borderRadius: 2, backgroundColor: "#FFF6E6" },
  hap: { position: "absolute", right: 12, top: 0 },
});
