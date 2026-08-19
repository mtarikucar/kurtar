import type { Palet } from "../../design/tokens";

/**
 * TENTE — the awning strip, spec §3.
 *
 * The 6pt band of diagonal stripes at the top of every card is the shop's
 * PERMANENT identity mark: it replaces the logo we don't have and the
 * photograph we will never have. Moda Fırın is always the red-and-white
 * one, and you learn it in two sessions. Ten lines of code, zero assets,
 * zero network, zero cache invalidation.
 *
 * The pair is chosen deterministically from the shop id, so it is the same
 * on the card, on the map pin, on the order row and in the profile street.
 */

export interface TenteDeseni {
  readonly ad: string;
  readonly bir: string;
  readonly iki: string;
}

/**
 * Six real Turkish awning combinations, rendered in the app's own values
 * so they sit in the palette. The green is the one green in the app and
 * it is muted to a zinc-leaning value: §3 names yeşil/beyaz explicitly as
 * one of the six, and a 6pt painted stripe is the opposite of the
 * eco-mint success colour §5.9 forbids.
 */
export const TENTE_DESENLERI: readonly TenteDeseni[] = Object.freeze([
  Object.freeze({ ad: "kirmizi-beyaz", bir: "#E4593F", iki: "#F2E6CE" }),
  Object.freeze({ ad: "yesil-beyaz", bir: "#5E7A62", iki: "#F2E6CE" }),
  Object.freeze({ ad: "mavi-beyaz", bir: "#3E6E86", iki: "#F2E6CE" }),
  Object.freeze({ ad: "sari-lacivert", bir: "#E8B23F", iki: "#22314F" }),
  Object.freeze({ ad: "pembe-krem", bir: "#C46A78", iki: "#EDD9BE" }),
  Object.freeze({ ad: "turuncu-beyaz", bir: "#D97A34", iki: "#F2E6CE" }),
]);

/** FNV-1a over the shop id — stable across devices, platforms and app
 * versions, which a JS string hash based on `Math.random` or object
 * identity would not be. */
export function tenteHash(dukkanId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < dukkanId.length; i += 1) {
    h ^= dukkanId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function tenteDeseni(dukkanId: string): TenteDeseni {
  const desen = TENTE_DESENLERI[tenteHash(dukkanId) % TENTE_DESENLERI.length];
  // The modulo cannot miss, but TS cannot know that and a fallback is
  // cheaper than a non-null assertion.
  return desen ?? TENTE_DESENLERI[0]!;
}

/** Sold out: the awning is still the shop's mark, just unlit. */
export function tenteSonuk(desen: TenteDeseni, palet: Palet): TenteDeseni {
  return {
    ad: desen.ad,
    bir: palet.metalKoyu,
    iki: palet.metalCinko,
  };
}
