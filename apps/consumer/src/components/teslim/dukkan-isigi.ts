import { rgbCoz } from "../../design/kontrast";
import type { Palet } from "../../design/tokens";

/**
 * The arithmetic of the opened shop's light, as data (spec §4.4 / §4.5).
 *
 * `<AcikDukkan/>` paints these numbers and nothing else, so what the room
 * does is reviewable — and testable — without rendering it. The same
 * separation `perde.ts` gives the ritual and `olcum.ts` gives the gauge.
 *
 * Two properties matter and both are asserted in
 * `teslim-acik-dukkan.test.ts`:
 *
 *  1. **The light never reaches zero.** A lit shop is dim at the back, not
 *     black; a falloff that lands on zero is the dead ground this exists
 *     to remove, arrived at gradually.
 *  2. **The light is bounded by the type in front of it.** This interior,
 *     unlike the card's band, carries the clock, the code and the ticket.
 *     Composited over each phase's own ground it may never take a pair
 *     below a contrast floor that the bare ground was meeting, which is
 *     what stops "make it warmer" from quietly becoming "make it
 *     unreadable".
 */

/** One stop of the room's vertical falloff: how far down the opening it
 * sits, and how much sodium is on the ground there. */
export interface IsikDuragi {
  /** 0 at the lintel, 1 at the sill. */
  readonly konum: number;
  /** Alpha BEFORE the phase's own `isikSiddeti` is applied. */
  readonly alfa: number;
}

/**
 * The lintel and the depth. Brightest immediately inside the opening,
 * where the lamp hangs; the last stop is the ambient floor.
 */
export const TAVAN: readonly IsikDuragi[] = Object.freeze([
  // The first two stops are the lintel band — the strip of ceiling just
  // inside the opening, where nothing is ever written and the light can
  // therefore be spent freely. Everything below it is inside the
  // legibility budget.
  { konum: 0, alfa: 0.26 },
  { konum: 0.02, alfa: 0.21 },
  { konum: 0.06, alfa: 0.19 },
  { konum: 0.35, alfa: 0.15 },
  { konum: 1, alfa: 0.13 },
]);

/** The lamp: a bloom with a source and an edge, so the room has a
 * direction of light rather than a flat wash. Its centre hangs just
 * inside the lintel and it dies well before the sill. */
export const LAMBA = Object.freeze({
  merkez: 0.04,
  cekirdek: 0.06,
  kenar: 0.02,
  yaricap: 0.58,
});

/** The counter: light pooling on the surface at the bottom of the
 * opening, over the last third of it. */
export const TEZGAH = Object.freeze({ oran: 0.34, enAz: 140, alfa: 0.11 });

/** The sill takes the light's core rather than a wash of it — it is the
 * one edge the lamp lands on square. 1.5pt, and nothing is written on it. */
export const ESIK = Object.freeze({ kalinlik: 1.5, opaklik: 0.7 });

function araDeger(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** The vertical falloff at a given depth, 0 (lintel) to 1 (sill). */
export function tavanAlfasi(oran: number): number {
  const y = Math.min(1, Math.max(0, oran));
  for (let i = 1; i < TAVAN.length; i += 1) {
    const onceki = TAVAN[i - 1];
    const simdiki = TAVAN[i];
    if (y <= simdiki.konum) {
      const genislik = simdiki.konum - onceki.konum;
      const t = genislik === 0 ? 0 : (y - onceki.konum) / genislik;
      return araDeger(onceki.alfa, simdiki.alfa, t);
    }
  }
  return TAVAN[TAVAN.length - 1].alfa;
}

/** The lamp's own contribution down the middle of the opening, which is
 * where every line of type on these two screens sits. */
export function lambaAlfasi(oran: number): number {
  const uzaklik = Math.abs(oran - LAMBA.merkez) / LAMBA.yaricap;
  if (uzaklik >= 1) return 0;
  // The bloom's stops are core → 0.6 → edge; between them it is linear,
  // which is what a two-stop-per-segment gradient renders.
  return uzaklik <= 0.6
    ? araDeger(LAMBA.cekirdek, LAMBA.kenar, uzaklik / 0.6)
    : araDeger(LAMBA.kenar, 0, (uzaklik - 0.6) / 0.4);
}

/** The counter's pool, which starts a third of the way up from the sill
 * (or 140pt up, whichever is further, hence the height in points). */
export function tezgahAlfasi(oran: number, yukseklik: number): number {
  const boy = Math.max(TEZGAH.enAz, Math.round(yukseklik * TEZGAH.oran));
  const bas = 1 - Math.min(1, boy / Math.max(1, yukseklik));
  if (oran <= bas) return 0;
  return TEZGAH.alfa * ((oran - bas) / Math.max(1e-6, 1 - bas));
}

/**
 * Everything the room lays over its ground at a given depth — the number
 * the legibility budget is spent from.
 */
export function toplamAlfa(oran: number, yukseklik: number): number {
  return tavanAlfasi(oran) + lambaAlfasi(oran) + tezgahAlfasi(oran, yukseklik);
}

/** The ceiling falloff as `expo-linear-gradient` wants it: a tuple of at
 * least two stops, built from TAVAN so the painted gradient and the
 * tested profile can never drift apart. */
export function tavanRenkleri(palet: Palet): readonly [string, string, ...string[]] {
  const [ilk, ikinci, ...kalan] = TAVAN;
  return [
    isikRengi(palet, ilk.alfa),
    isikRengi(palet, ikinci.alfa),
    ...kalan.map((durak) => isikRengi(palet, durak.alfa)),
  ];
}

export function tavanKonumlari(): readonly [number, number, ...number[]] {
  const [ilk, ikinci, ...kalan] = TAVAN;
  return [ilk.konum, ikinci.konum, ...kalan.map((durak) => durak.konum)];
}

/** `"R,G,B"` at an alpha, scaled by how hard this phase's shop burns.
 * Never `'transparent'`: Android interpolates that through #00000000 and
 * leaves a grey smudge at the fade (§5.7). */
export function isikRengi(palet: Palet, kat: number): string {
  return `rgba(${palet.isikRgb},${(kat * palet.isikSiddeti).toFixed(3)})`;
}

/** The colour a surface actually ends up when the room's light lands on
 * it — used by the contrast assertions, which have to measure what the
 * eye sees rather than what the token says. */
export function isikAltindaZemin(palet: Palet, alfa: number): string {
  const [zr, zg, zb] = rgbCoz(palet.bgDerin);
  const [ir, ig, ib] = palet.isikRgb.split(",").map(Number) as [
    number,
    number,
    number,
  ];
  const a = Math.min(1, Math.max(0, alfa * palet.isikSiddeti));
  const kanal = (zemin: number, isik: number) =>
    Math.round(zemin + (isik - zemin) * a)
      .toString(16)
      .padStart(2, "0");
  return `#${kanal(zr, ir)}${kanal(zg, ig)}${kanal(zb, ib)}`;
}

/**
 * How warm a colour is, as the plainest number that means it: red minus
 * blue. Contrast cannot express this — sodium over the day palette's pale
 * slate barely moves the luminance, which is exactly why the daylight
 * interior has to be checked for WARMTH rather than for brightness.
 */
export function sicaklik(hex: string): number {
  const [r, , b] = rgbCoz(hex);
  return r - b;
}
