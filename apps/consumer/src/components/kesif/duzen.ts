/**
 * The street spine's geometry (spec §4.1: "A 1pt line.hairline rule down
 * the left gutter with mono distance labels … pinned beside each card").
 *
 * §3 derives the card's fixed 358pt width from "390 screen − 16pt
 * gutters" — a card with NO spine. The spine is a graft onto that same
 * card on exactly one screen, and there is no room left on a 390pt phone
 * to keep the card at 358 AND add a spine column on top of two full 16pt
 * gutters — `VitrinKarti` is a shared Phase 1 component (its own 12pt
 * content padding is not this track's to touch), so the ONLY levers
 * available here are the spine's own footprint and the list's OWN left
 * inset.
 *
 * First pass took the entire spine width out of the card (358 → 291) and
 * kept both 16pt screen gutters untouched — reviewed and confirmed
 * clipping real content (`280–380₺ değerinde`, the meta rail's
 * `18:30–21:00 · 1,3 km · 16 dk`) at that width; see build log for the
 * exact glyph-advance math. Fixed by treating the spine as the LEFT
 * gutter rather than a tax on top of it — the list's own left inset
 * shrinks to `KESIF_SOL_KENAR` (the hairline and its label read as the
 * street's own edge, the same way a sidebar rail sits flush) — and by
 * tightening the spine's internal gaps, while the right gutter stays the
 * full 16pt so the list's right edge still lines up with the header and
 * the filter chips above it.
 *
 * The label column is 54pt AT 1×, measured to the millimetre for the
 * widest real distance this app prints ("10,3 km"). It is not a lever for
 * width — but it is not a constant either: the label is `yazi.data` with
 * `allowFontScaling` on, so at the largest text step it is drawn 1.3×
 * bigger and 54pt clipped the one number the spine exists to show. So the
 * column is DERIVED from the label's own capped scale, and the card gets
 * back exactly what the spine takes, no more.
 */

import { PixelRatio } from "react-native";
import { s } from "../../design/tokens";

/** Right-aligned distance text column, at 1×. Real seeded distances reach
 * into double-digit kilometres ("10,3 km" — 7 Chivo Mono characters at
 * 12pt `data`, tracking +0.4 — 53.2pt of glyph advance), so this is sized
 * for that, not the single-digit "2,4 km" example. Do not shrink this: it
 * is already within a point of the real minimum. */
export const SPINE_ETIKET_TABANI = 54;
/** `yazi.data`'s own `maxFontSizeMultiplier` — the label is drawn at the
 * user's text size but never past this, so neither does its column. */
export const SPINE_ETIKET_TAVANI = 1.3;
/** Label-to-hairline and hairline-to-card gaps — tightened from the
 * first pass's 6pt to buy the card back its content width without
 * touching the label or the type scale. */
export const SPINE_BOSLUK = 3;
export const SPINE_HAIRLINE_GENISLIGI = 1;
/** gap + hairline + gap — everything in the spine that is not the label. */
export const SPINE_KENAR_TOPLAMI =
  SPINE_BOSLUK + SPINE_HAIRLINE_GENISLIGI + SPINE_BOSLUK;

/** The list's own left inset — the spine reads as the street's left edge
 * rather than sitting a further 16pt gutter beyond it. The right side
 * keeps the screen's normal `s4` gutter (`KESIF_SAG_KENAR`) so the list's
 * right edge still lines up with the header and the filter chips. */
export const KESIF_SOL_KENAR = 0;
export const KESIF_SAG_KENAR = s.s4;

const MIN_KART_GENISLIGI = 280;

/** The spec's own reference phone (§3: "390 screen − 16pt gutters"). Used
 * only as the default when a caller has no measured width to hand. */
export const KESIF_VARSAYILAN_EKRAN = 390;

/**
 * The distance column's width at the user's text size.
 *
 * The label grows with `yazi.data` up to its own 1.3 ceiling, and the
 * column grows with it — otherwise "10,3 km" becomes "10,3 k…" at exactly
 * the setting a user chose because they could not read it before.
 *
 * The growth is bounded by what the row can actually afford: the card
 * below 280pt starts crushing the tabela under its own 14pt floor, so on
 * a narrow phone the spine takes only the slack that is there. That trade
 * is deliberate and it is one-way — the card's meta rail prints the same
 * distance a second time, so a short spine label costs a duplicate; a
 * short card costs the pickup window.
 */
export function spineEtiketGenisligi(
  ekranGenisligi: number = KESIF_VARSAYILAN_EKRAN,
  olcek: number = PixelRatio.getFontScale(),
): number {
  const carpan = Math.min(Math.max(olcek, 1), SPINE_ETIKET_TAVANI);
  const istenen = Math.ceil(SPINE_ETIKET_TABANI * carpan);
  const kalan =
    ekranGenisligi - KESIF_SOL_KENAR - KESIF_SAG_KENAR - MIN_KART_GENISLIGI - SPINE_KENAR_TOPLAMI;
  return Math.max(SPINE_ETIKET_TABANI, Math.min(istenen, Math.floor(kalan)));
}

/** label + gap + hairline + gap. */
export function spineToplamGenisligi(
  ekranGenisligi: number = KESIF_VARSAYILAN_EKRAN,
  olcek: number = PixelRatio.getFontScale(),
): number {
  return spineEtiketGenisligi(ekranGenisligi, olcek) + SPINE_KENAR_TOPLAMI;
}

/** The card width for a given viewport — the list's own left inset, the
 * spine, and the screen's right gutter, floored so a very narrow device
 * never crushes the tabela below its own 14pt type floor. */
export function kartGenisligiHesapla(
  ekranGenisligi: number,
  olcek: number = PixelRatio.getFontScale(),
): number {
  const aday =
    ekranGenisligi -
    KESIF_SOL_KENAR -
    spineToplamGenisligi(ekranGenisligi, olcek) -
    KESIF_SAG_KENAR;
  return Math.max(MIN_KART_GENISLIGI, Math.round(aday));
}
