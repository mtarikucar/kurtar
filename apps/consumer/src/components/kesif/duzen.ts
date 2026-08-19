/**
 * The street spine's geometry (spec §4.1: "A 1pt line.hairline rule down
 * the left gutter with mono distance labels … pinned beside each card").
 *
 * §3 derives the card's fixed 358pt width from "390 screen − 16pt
 * gutters" — a card with NO spine. The spine is a graft onto that same
 * card on exactly one screen, and there is no room left on a 390pt phone
 * to keep the card at 358 AND add a spine column on top of two full 16pt
 * gutters — `VitrinKarti` is a shared Phase 1 component (frozen; its own
 * 12pt content padding is not this track's to touch), so the ONLY levers
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
 * the filter chips above it. The label itself is UNCHANGED at 54pt: it
 * is already sized to the millimetre for the widest real distance this
 * app prints ("10,3 km"), and shrinking the one number the spine exists
 * to show would just move the clipping bug onto the spine itself.
 */

import { s } from "../../design/tokens";

/** Right-aligned distance text column. Real seeded distances reach into
 * double-digit kilometres ("10,3 km" — 7 Chivo Mono characters at 12pt
 * `data`, tracking +0.4 — 53.2pt of glyph advance), so this is sized for
 * that, not the single-digit "2,4 km" example. Do not shrink this: it is
 * already within a point of the real minimum. */
export const SPINE_ETIKET_GENISLIGI = 54;
/** Label-to-hairline and hairline-to-card gaps — tightened from the
 * first pass's 6pt to buy the card back its content width without
 * touching the label or the type scale. */
export const SPINE_BOSLUK = 3;
export const SPINE_HAIRLINE_GENISLIGI = 1;

/** label + gap + hairline + gap. */
export const SPINE_TOPLAM_GENISLIK =
  SPINE_ETIKET_GENISLIGI + SPINE_BOSLUK + SPINE_HAIRLINE_GENISLIGI + SPINE_BOSLUK;

/** The list's own left inset — the spine reads as the street's left edge
 * rather than sitting a further 16pt gutter beyond it. The right side
 * keeps the screen's normal `s4` gutter (`KESIF_SAG_KENAR`) so the list's
 * right edge still lines up with the header and the filter chips. */
export const KESIF_SOL_KENAR = 0;
export const KESIF_SAG_KENAR = s.s4;

const MIN_KART_GENISLIGI = 280;

/** The card width for a given viewport — the list's own left inset, the
 * spine, and the screen's right gutter, floored so a very narrow device
 * never crushes the tabela below its own 14pt type floor. */
export function kartGenisligiHesapla(ekranGenisligi: number): number {
  const aday = ekranGenisligi - KESIF_SOL_KENAR - SPINE_TOPLAM_GENISLIK - KESIF_SAG_KENAR;
  return Math.max(MIN_KART_GENISLIGI, Math.round(aday));
}
