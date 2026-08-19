/**
 * Design tokens — docs/design/consumer-app-spec.md §1.
 *
 * Three complete palettes ("faz"), built and frozen at module scope so
 * `StyleSheet.create` keeps its static advantage: colours are stable
 * references INSIDE a phase, and a phase change swaps the whole object
 * through the ThemeContext rather than animating any colour property
 * (spec §1.1: "Three discrete phases, never an interpolation").
 *
 * Every colour names a physical thing off a Kadıköy street at closing
 * time — zinc, painted sign ivory, sodium light, awning red — never a
 * semantic slot, and there is no green anywhere in the type/surface set
 * (spec §1.1 / §5.9). The only hue in the green family in the whole app
 * is one of the six real awning stripe pairs (see tente-desen.ts), which
 * §3 names explicitly.
 */

export type Faz = "gunduz" | "alacakaranlik" | "gece";

/**
 * The token surface every component reads. It is IDENTICAL across the
 * three phases — a component never asks "which phase is this?", it just
 * reads the token, which is what makes the day inversion (spec §1.1:
 * "the palette does not merely lighten; it inverts the light source") a
 * palette swap rather than a fork in every component.
 */
export interface Palet {
  readonly faz: Faz;

  /** App ground, list background, map land. */
  readonly bgAsfalt: string;
  /** Recessed ground: map water, redeem ground. */
  readonly bgDerin: string;
  /** Storefront card face, input fields, order rows. */
  readonly yuzeyKaldirim: string;
  /** Bottom sheets, tab bar, sticky CTA bar. */
  readonly yuzeyYukselti: string;
  /** 1pt borders/dividers where unavoidable. */
  readonly cizgiKil: string;

  /** Shutter body fill. Metals are phase-INVARIANT (spec §1.1: zinc reads
   * as a shadow-shape against bright ivory, so the metaphor holds without
   * a second metal set). */
  readonly metalCinko: string;
  readonly metalAcik: string;
  readonly metalKoyu: string;
  readonly metalDudak: string;

  /** All primary type. */
  readonly yaziAna: string;
  /** All secondary type. */
  readonly yaziSis: string;

  /** Sodium as a FILL (CTA, value bar, lit dots) — the same #FFB23F in
   * every phase, because a lit sodium lamp is the same colour at noon. */
  readonly sodyumDolgu: string;
  /** Sodium as TYPE. On light grounds #FFB23F fails contrast, so the day
   * phases use the darker amber (spec §1.1: "#FFB23F survives only as a
   * fill with dark ink"). */
  readonly sodyumYazi: string;
  /** Ink ON a sodium fill. */
  readonly sodyumMurekkep: string;

  /** Awning red as a FILL. Never type on a card — spec §1.1's
   * non-negotiable rule; it is 4.38:1 on the night card. */
  readonly tenteDolgu: string;
  /** Awning red as TYPE — legal on exactly one surface per phase, and
   * that surface is declared next to it rather than assumed: at night the
   * ground is the dark thing and red sits there; by day the card is the
   * light thing and red sits there instead. design-contrast.test.ts holds
   * the pair to 4.5:1 in every phase. */
  readonly tenteYazi: string;
  /** The one surface `tenteYazi` may be set on in this phase. */
  readonly tenteYaziZemini: string;
  /** Ink ON an awning-red fill. */
  readonly tenteMurekkep: string;

  /** Card chassis. Elevation is 0 everywhere (spec §1.3): depth is a top
   * hairline (light landing on an edge) plus a bottom contact edge. */
  readonly kartCizgi: string;
  readonly kartCizgiKalinlik: number;
  readonly kartUstIsik: string;
  readonly kartAltTemas: string;

  /** The vitrin (shop opening) behind the shutter, UNLIT: the interior of
   * a shop with the lights off. Everything that makes it read as lit is
   * painted on top of it and scales with how far the shutter has come
   * down. */
  readonly vitrinZemin: string;
  /**
   * The sodium the shop emits, as an "R,G,B" triple.
   *
   * A triple rather than finished colours because the light's ALPHA is a
   * function of the gauge — the narrower the slit, the hotter it burns
   * (see `isikGucu()`) — so the stops are composed per frame. Every one
   * of them ends at `rgba(R,G,B,0)`, never `'transparent'` (§5.7).
   */
  readonly isikRgb: string;
  /** The opaque core of the light, right under the lip: the bit that is
   * brighter than any surface on the card. */
  readonly isikCekirdek: string;
  /** How hard this phase's shop burns. At noon the same lamp against a
   * bright street is a fraction of what it is at midnight. */
  readonly isikSiddeti: number;
  /** Flat fallback for `deviceYearClass < 2019` (spec §2 Degradation). */
  readonly isikTasmasiDuz: string;
  /** 1.5pt line-art category glyph — a tool INSIDE the lit shop, so it
   * reads as a silhouette against the light rather than a pale line. */
  readonly glyphCizgi: string;

  /** Tabela plaque. */
  readonly plakaZemin: string;
  readonly plakaCizgi: string;
  readonly plakaYazi: string;
  /** The TÜKENDİ variant's unlit sign (spec §3: ivory at 22%). */
  readonly plakaYaziSonuk: string;
  /** The two mounting bolts every real Turkish sign has. */
  readonly plakaBoltu: string;

  /** Time pill riding the shutter lip. */
  readonly hapZemin: string;
  readonly hapCizgi: string;
  readonly hapYazi: string;

  /** Shutter detail: the vertical seam and the specular line above the lip. */
  readonly kepenkDikey: string;
  readonly kepenkDudakIsik: string;

  /** Value-bar track. */
  readonly cubukRay: string;
  /** A lit stock square (spec §3, ≤4 remaining). */
  readonly stokIsik: string;
}

/** Night — default from sunset−45min onward (spec §1.1). */
const GECE: Palet = Object.freeze({
  faz: "gece",
  bgAsfalt: "#12181F",
  bgDerin: "#0E141A",
  yuzeyKaldirim: "#1B232C",
  yuzeyYukselti: "#232D38",
  cizgiKil: "#2C3742",
  metalCinko: "#5E6A67",
  metalAcik: "#6A7673",
  metalKoyu: "#4E5A57",
  metalDudak: "#2A3330",
  yaziAna: "#F2E6CE",
  yaziSis: "#9FB0AC",
  sodyumDolgu: "#FFB23F",
  sodyumYazi: "#FFB23F",
  sodyumMurekkep: "#12181F",
  tenteDolgu: "#E4593F",
  tenteYazi: "#E4593F",
  tenteYaziZemini: "#12181F",
  tenteMurekkep: "#12181F",
  kartCizgi: "rgba(242,230,206,0)",
  kartCizgiKalinlik: 0,
  kartUstIsik: "rgba(242,230,206,0.07)",
  kartAltTemas: "#0E141A",
  // Warm, not black: this is the inside of a shop, and the only reason
  // it is ever dark is that the lamp is off (sold out, or not open yet).
  vitrinZemin: "#1A1207",
  isikRgb: "255,178,63",
  isikCekirdek: "#FFD79A",
  isikSiddeti: 1,
  isikTasmasiDuz: "rgba(255,178,63,0.35)",
  glyphCizgi: "rgba(60,32,4,0.58)",
  plakaZemin: "#0E141A",
  plakaCizgi: "rgba(242,230,206,0.35)",
  plakaYazi: "#F2E6CE",
  plakaYaziSonuk: "rgba(242,230,206,0.22)",
  plakaBoltu: "rgba(242,230,206,0.55)",
  hapZemin: "#0E141A",
  hapCizgi: "#5E6A67",
  hapYazi: "#F2E6CE",
  kepenkDikey: "rgba(242,230,206,0.10)",
  kepenkDudakIsik: "rgba(242,230,206,0.15)",
  cubukRay: "rgba(242,230,206,0.14)",
  stokIsik: "#FFE0A8",
} as const);

/**
 * Day — before sunset−45min. The card BECOMES the painted sign: ivory is
 * only ever paint on an object, never the ground (spec §1.1), so the
 * ground is a cool pale slate and the shutters read as dark shapes
 * against a bright street.
 */
const GUNDUZ: Palet = Object.freeze({
  faz: "gunduz",
  bgAsfalt: "#C7D0D2",
  bgDerin: "#B4BEC1",
  yuzeyKaldirim: "#F2E6CE",
  yuzeyYukselti: "#F8EEDA",
  cizgiKil: "#A9B5B7",
  metalCinko: "#5E6A67",
  metalAcik: "#6A7673",
  metalKoyu: "#4E5A57",
  metalDudak: "#2A3330",
  yaziAna: "#12181F",
  yaziSis: "#4B5A58",
  sodyumDolgu: "#FFB23F",
  sodyumYazi: "#8A4A05",
  sodyumMurekkep: "#12181F",
  tenteDolgu: "#E4593F",
  tenteYazi: "#A8321F",
  tenteYaziZemini: "#F2E6CE",
  tenteMurekkep: "#12181F",
  kartCizgi: "#A9B5B7",
  kartCizgiKalinlik: 1,
  kartUstIsik: "rgba(255,255,255,0.55)",
  kartAltTemas: "rgba(18,24,31,0.22)",
  // In daylight the opening is the DARK thing — a recess in a bright
  // street — so the unlit interior is a NEUTRAL deep shade, which is what
  // makes the lit state read as warm against it, and the lamp inside is a
  // fraction of its night self. A lit shop is still visible through a
  // narrow gap at noon, which is why the light does not go to zero.
  vitrinZemin: "#4A4740",
  isikRgb: "255,190,90",
  isikCekirdek: "#FFD9A5",
  isikSiddeti: 0.62,
  isikTasmasiDuz: "rgba(255,190,90,0.22)",
  glyphCizgi: "rgba(30,18,4,0.52)",
  plakaZemin: "#E6D6B4",
  plakaCizgi: "rgba(18,24,31,0.32)",
  plakaYazi: "#12181F",
  plakaYaziSonuk: "rgba(18,24,31,0.30)",
  plakaBoltu: "rgba(18,24,31,0.45)",
  // The pill rides the zinc shutter, which is dark in every phase — so it
  // stays a dark plate with ivory data type in daylight too.
  hapZemin: "#12181F",
  hapCizgi: "#4E5A57",
  hapYazi: "#F2E6CE",
  kepenkDikey: "rgba(242,230,206,0.10)",
  kepenkDudakIsik: "rgba(242,230,206,0.15)",
  cubukRay: "rgba(18,24,31,0.14)",
  stokIsik: "#B26A0A",
} as const);

/**
 * Twilight — sunset−45min .. sunset+25min. The spec gives this palette as
 * a parenthetical pair (bg #6E7A80, card #E3DAC8) and never measures it.
 * The ground is lightened to #7A868C: at #6E7A80 NOTHING clears 4.5:1 for
 * ground-level type (near-black tops out at 4.76:1 and pure black is not
 * in this palette), which would have broken the contrast floor the rest
 * of the spec holds. See design-contrast.test.ts.
 */
const ALACAKARANLIK: Palet = Object.freeze({
  faz: "alacakaranlik",
  bgAsfalt: "#7A868C",
  bgDerin: "#5F6B72",
  yuzeyKaldirim: "#E3DAC8",
  yuzeyYukselti: "#EDE4D2",
  cizgiKil: "#96A2A6",
  metalCinko: "#5E6A67",
  metalAcik: "#6A7673",
  metalKoyu: "#4E5A57",
  metalDudak: "#2A3330",
  yaziAna: "#12181F",
  yaziSis: "#4B5A58",
  sodyumDolgu: "#FFB23F",
  sodyumYazi: "#8A4A05",
  sodyumMurekkep: "#12181F",
  tenteDolgu: "#E4593F",
  tenteYazi: "#A8321F",
  tenteYaziZemini: "#E3DAC8",
  tenteMurekkep: "#12181F",
  kartCizgi: "#A9B5B7",
  kartCizgiKalinlik: 1,
  kartUstIsik: "rgba(255,255,255,0.45)",
  kartAltTemas: "rgba(18,24,31,0.26)",
  // Dusk is the one moment both light sources are on: the lamp is lit and
  // the sky still carries the street, so the interior is a warm mid-shade
  // and the lamp reads at four-fifths.
  vitrinZemin: "#37342B",
  isikRgb: "255,184,72",
  isikCekirdek: "#FFDCA6",
  isikSiddeti: 0.82,
  isikTasmasiDuz: "rgba(255,184,72,0.28)",
  glyphCizgi: "rgba(40,24,4,0.55)",
  plakaZemin: "#D8CCB4",
  plakaCizgi: "rgba(18,24,31,0.32)",
  plakaYazi: "#12181F",
  plakaYaziSonuk: "rgba(18,24,31,0.30)",
  plakaBoltu: "rgba(18,24,31,0.45)",
  hapZemin: "#12181F",
  hapCizgi: "#4E5A57",
  hapYazi: "#F2E6CE",
  kepenkDikey: "rgba(242,230,206,0.10)",
  kepenkDudakIsik: "rgba(242,230,206,0.15)",
  cubukRay: "rgba(18,24,31,0.14)",
  stokIsik: "#B26A0A",
} as const);

export const PALETLER: Readonly<Record<Faz, Palet>> = Object.freeze({
  gunduz: GUNDUZ,
  alacakaranlik: ALACAKARANLIK,
  gece: GECE,
});

/** Spacing — 4pt base (spec §1.3). Screen gutter s4, card-to-card gap s3. */
export const s = Object.freeze({
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
} as const);

/**
 * Radii (spec §1.3). The 4pt card radius is load-bearing: shopfronts and
 * shutter boxes are not pill-shaped, and this single number is the fastest
 * visual separation from the rounded-white-tile build the client rejected.
 * Never raise it (§5.2).
 */
export const r = Object.freeze({
  card: 4,
  plaque: 3,
  pill: 10,
  sheet: 16,
  cta: 6,
} as const);

/**
 * Motion durations in ms (spec §1.3). Easing curves live in motion.ts so
 * this module stays plain data.
 *
 * `press` is the ENTIRE press budget: an opacity, no scale, no glow (§5.10).
 */
export const m = Object.freeze({
  pressOpacity: 0.85,
  fast: 150,
  base: 220,
  snap: 180,
  roll: 700,
  floodIn: 400,
  floodHold: 2200,
  floodOut: 350,
  phase: 600,
  /** The <30dk time-pill flip (spec §3): one cross-fade, once. */
  hapFlip: 300,
  /** The single lit stock square's breath at ≤2 remaining (spec §3). */
  stokNefes: 2400,
} as const);

/**
 * Type scale (spec §1.2). Line heights are ABSOLUTE, never multipliers —
 * Android clips ğ/ş/ç descenders and the İ dot at tight multiplied
 * leading, which is the single most common Turkish typesetting bug.
 *
 * Anything marked "caps" in the spec is fed PRE-UPPERCASED text (tr.json
 * keys, or trUpper() for names out of the DB). There is no
 * `textTransform` anywhere in this app — it is not locale-aware (§5.6).
 */
export interface YaziTokeni {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  /** Dynamic type ceiling; `allowFontScaling` itself stays true everywhere. */
  readonly maxFontSizeMultiplier?: number;
}

export const yazi = Object.freeze({
  tabelaXl: {
    fontFamily: "ArchivoBlack_400Regular",
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
    maxFontSizeMultiplier: 1.4,
  },
  tabelaLg: {
    fontFamily: "ArchivoBlack_400Regular",
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.2,
    maxFontSizeMultiplier: 1.4,
  },
  clock: {
    fontFamily: "ChivoMono_700Bold",
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: 0,
    maxFontSizeMultiplier: 1.6,
  },
  code: {
    fontFamily: "ChivoMono_700Bold",
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: 6,
    maxFontSizeMultiplier: 1.6,
  },
  priceXl: {
    fontFamily: "ChivoMono_700Bold",
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  priceLg: {
    fontFamily: "ChivoMono_700Bold",
    fontSize: 26,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  title: {
    fontFamily: "Archivo_600SemiBold",
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  paket: {
    fontFamily: "Archivo_500Medium",
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0,
  },
  body: {
    fontFamily: "Archivo_400Regular",
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: "Archivo_600SemiBold",
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
  },
  data: {
    fontFamily: "ChivoMono_500Medium",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    maxFontSizeMultiplier: 1.3,
  },
  dataLg: {
    fontFamily: "ChivoMono_700Bold",
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  label: {
    fontFamily: "Archivo_500Medium",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.9,
  },
  micro: {
    fontFamily: "Archivo_500Medium",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
  },
  /** The one Archivo 700 use the spec calls for by weight: the ink on a
   * flipped (red) time pill / stock chip. */
  cipAlarm: {
    fontFamily: "Archivo_700Bold",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    maxFontSizeMultiplier: 1.3,
  },
  /** TÜKENDİ sticker (spec §3). */
  sticker: {
    fontFamily: "ArchivoBlack_400Regular",
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 0.4,
    maxFontSizeMultiplier: 1.2,
  },
} as const satisfies Record<string, YaziTokeni>);

/**
 * Offer-card geometry (spec §3). Fixed height so FlashList's
 * `estimatedItemSize` is exact and the eye can fix a column while
 * scrolling; at `PixelRatio.getFontScale() >= 1.3` every band grows and
 * the gauge recomputes from `band`, so it stays honest at every text size
 * (spec §1.2 Dynamic type).
 */
export const kart = Object.freeze({
  genislik: 358,
  yukseklik: 196,
  yukseklikBuyuk: 232,
  tente: 6,
  band: 68,
  bandBuyuk: 78,
  tabela: 40,
  tabelaBuyuk: 48,
  aralik: s.s3,
  /** FlashList estimatedItemSize = card + gap. */
  satirYuksekligi: 196 + s.s3,
  buyumeEsigi: 1.3,
} as const);
