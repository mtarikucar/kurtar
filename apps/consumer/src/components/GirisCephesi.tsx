import { TENTE_DESENLERI } from "./kepenk/tente-desen";
import { Cephe } from "./Cephe";

/** The brand's own awning: kırmızı/beyaz, the first of the six real
 * combinations every shop in the app is hashed onto (§3). kurtar is a
 * shop on this street too. */
const MARKA_TENTE = TENTE_DESENLERI[0];
const MARKA = "kurtar";

/**
 * The storefront over the sign-in screens.
 *
 * The auth trio was the first thing anyone saw and had no relationship to
 * the product at all: a coloured wordmark over two form rows, the same
 * screen as any other app's. This is the app's own object — the awning,
 * the corrugated shutter, the light under it, the painted sign with its
 * mounting bolts. A user who has seen this screen recognises the offer
 * card the moment discovery loads, because it is the same thing.
 *
 * No photography, no logo asset, no network: the tente and the glyph ARE
 * the identity system (§5.15).
 */
export function GirisCephesi() {
  return <Cephe desen={MARKA_TENTE} ad={MARKA} yanik testIDOneki="giris" />;
}
