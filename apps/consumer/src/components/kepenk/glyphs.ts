/**
 * Category glyphs — spec §3.
 *
 * We draw the shop's TOOLS, which we know, never the bag's contents,
 * which we don't. One 1.5pt line-art path per category, sitting at 14%
 * ivory inside the vitrin, behind the shutter.
 *
 * Authored in a 48×48 box and scaled to the band; a single `<Path>`, so
 * the whole decorative layer costs one node per card.
 */

export type GlyphAnahtari = "firin" | "pastane" | "manav" | "kafe" | "mutfak" | "market";

export const GLYPH_KUTUSU = 48;

export const GLYPH: Readonly<Record<GlyphAnahtari, string>> = Object.freeze({
  // Oven arch, hearth, and a peel with a flat blade — a lollipop-shaped
  // peel (a stick with a circle) reads as a magnifying glass at 14%.
  firin:
    "M4 42 H44 M9 42 V23 A15 15 0 0 1 39 23 V42 M14 40 L26 28 M24 26 L31 19 L36 24 L29 31 Z",
  // Cake dome on a counter.
  pastane:
    "M4 41 H44 M8 35 H40 M10 35 A14 14 0 0 1 38 35 M24 21 V16 M20 16 H28",
  // Hanging pan scale.
  manav:
    "M24 8 V15 M8 15 H40 M24 15 V38 M16 41 H32 M12 15 L7 24 M12 15 L17 24 M6 24 A6 6 0 0 0 18 24 M36 15 L31 24 M36 15 L41 24 M30 24 A6 6 0 0 0 42 24",
  // Portafilter over a cup.
  kafe:
    "M12 17 H34 L31 25 H15 Z M34 21 H43 M21 25 V30 M27 25 V30 M17 33 H31 V38 A5 5 0 0 1 26 43 H22 A5 5 0 0 1 17 38 Z",
  // Pot with a lid.
  mutfak:
    "M8 21 H40 M24 21 V16 M11 24 H37 V37 A4 4 0 0 1 33 41 H15 A4 4 0 0 1 11 37 Z M11 28 H6 M37 28 H42",
  // Market crate.
  market:
    "M8 20 H40 L36 41 H12 Z M11 30 H37 M17 20 L20 41 M31 20 L28 41",
});

/** The API's own categories (backend BagCategory). */
export type UrunKategorisi = "MEAL" | "BAKERY" | "GROCERY" | "PRODUCE" | "OTHER";

const KATEGORI_GLYPH: Readonly<Record<UrunKategorisi, GlyphAnahtari>> = Object.freeze({
  MEAL: "mutfak",
  BAKERY: "firin",
  GROCERY: "market",
  PRODUCE: "manav",
  OTHER: "kafe",
});

/**
 * A pastane and a fırın are both BAKERY in the API, and they are not the
 * same shop to anyone standing in front of them — the sign says so. When
 * the name says pastane, draw the cake dome; otherwise the category
 * decides. This is the only place the app reads a shop name for anything
 * but display, and it is why Yeldeğirmeni Pastanesi does not wear a
 * bread peel.
 */
const PASTANE_IZI = /pastane|pastanesi|pasta|tatl|börek|kurabiye|baklava/i;

export function glyphSec(kategori: string, dukkanAdi: string): GlyphAnahtari {
  if (PASTANE_IZI.test(dukkanAdi)) return "pastane";
  const kat = kategori.toUpperCase() as UrunKategorisi;
  return KATEGORI_GLYPH[kat] ?? "kafe";
}
