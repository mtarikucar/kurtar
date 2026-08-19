/**
 * The street spine's geometry (spec §4.1: "A 1pt line.hairline rule down
 * the left gutter with mono distance labels … pinned beside each card").
 *
 * §3 derives the card's fixed 358pt width from "390 screen − 16pt
 * gutters" — a card with NO spine. The spine is a graft onto that same
 * card on exactly one screen, and there is no room left on a 390pt phone
 * to keep the card at 358 AND add a spine column without breaking the
 * 16pt gutter on at least one side (358 + 16 + 16 already accounts for
 * the full width). Rather than shrink the right gutter to zero or let the
 * spine overlap the card, the card's WIDTH — a prop `VitrinKarti` already
 * takes, not a value baked into the component — narrows by exactly the
 * spine's own width, so the screen keeps symmetric 16pt gutters and every
 * card in the list still shares one fixed column width (spec §3: "the eye
 * can fix a column while scrolling"). See build log §4 for the full
 * reasoning.
 */

import { s } from "../../design/tokens";

/** Right-aligned distance text column. Real seeded distances reach into
 * double-digit kilometres ("10,3 km" — 7 Chivo Mono characters at 12pt),
 * so this is sized for that, not the single-digit "2,4 km" example. */
export const SPINE_ETIKET_GENISLIGI = 54;
export const SPINE_BOSLUK = 6;
export const SPINE_HAIRLINE_GENISLIGI = 1;

/** label + gap + hairline + gap. */
export const SPINE_TOPLAM_GENISLIK =
  SPINE_ETIKET_GENISLIGI + SPINE_BOSLUK + SPINE_HAIRLINE_GENISLIGI + SPINE_BOSLUK;

const MIN_KART_GENISLIGI = 280;

/** The card width for a given viewport — screen gutter on both sides,
 * spine on the left, floored so a very narrow device never crushes the
 * tabela below its own 14pt type floor. */
export function kartGenisligiHesapla(ekranGenisligi: number): number {
  const aday = ekranGenisligi - s.s4 - SPINE_TOPLAM_GENISLIK - s.s4;
  return Math.max(MIN_KART_GENISLIGI, Math.round(aday));
}
