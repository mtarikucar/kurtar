import { kart, yazi } from "../../design/tokens";
import { kis } from "./olcum";

/**
 * How tall the offer card has to be at the user's text size (spec §1.2
 * Dynamic type, §3's zone map).
 *
 * §3 fixes the card at 196pt and §1.2 grows it to 232 at
 * `PixelRatio.getFontScale() >= 1.3`. Both numbers are drawing decisions
 * — 6 tente + 68 kepenk + 40 tabela is a shutter, an awning and a sign in
 * a proportion that IS the gauge, and 232 keeps that proportion when the
 * bands step up (78 + 48). What neither number does is check that the
 * type still fits underneath: at 1.3× the pavement block needs 108pt and
 * 232 leaves it 96, so `overflow: 'hidden'` ate the meta rail — the
 * pickup window, the distance and the stock chip, three of the four
 * things a card exists to say. At iOS's XXL (1.235×) the card did not
 * grow at all and lost ~5pt off the same rail.
 *
 * So the DRAWING keeps its two spec'd steps and the PAVEMENT is measured:
 * the block asks for the height its own type tokens need at the scale
 * they will be drawn at, and the card is exactly that much taller. The
 * shutter never shrinks to make room, because a shutter that shrinks to
 * fit text is no longer a gauge; the card grows instead, which is the
 * one dimension a vertical list can afford to spend.
 *
 * Floored at §3's 196 so nothing moves by a single pixel at the default
 * text size, or below it.
 */

/** VitrinKarti's own declared ceilings, kept beside the arithmetic that
 * depends on them: `paket` and the price are capped at 1.4, everything
 * built on `yazi.data` / `yazi.micro` at 1.3. */
const PAKET_TAVANI = 1.4;
const FIYAT_TAVANI = 1.4;
const DATA_TAVANI = 1.3;

/** The değer çubuğu's track (spec §3: "4pt track"). */
const CUBUK_YUKSEKLIGI = 4;
/** The stock chip's floor — it grows with its own label past this. */
const CIP_TABAN_YUKSEKLIGI = 18;
/** `styles.kaldirim`'s paddingBottom. */
const KALDIRIM_ALT_BOSLUK = 2;
/** The card's 1pt border, top and bottom (RN boxes are border-box). */
const KENARLIK = 2;

/** The chip is a fixed-height pill at 1× and a growing one past that —
 * its own `data` label is what sets the floor, and a pill drawn shorter
 * than the number inside it cuts through its own digits. */
function cipYuksekligi(olcek: number): number {
  return Math.max(CIP_TABAN_YUKSEKLIGI, yazi.data.lineHeight * kis(olcek, 1, DATA_TAVANI));
}

export interface KartOlculeri {
  /** §1.2's `>= 1.3` step: bands grow and the price row stacks. */
  readonly buyuk: boolean;
  readonly band: number;
  readonly tabela: number;
  /** What the pavement block needs, padding included. */
  readonly kaldirim: number;
  /** How many lines the meta rail is allowed. */
  readonly metaSatirSayisi: number;
  readonly yukseklik: number;
}

export function kartOlculeri(olcek: number): KartOlculeri {
  const buyuk = olcek >= kart.buyumeEsigi;
  const band = buyuk ? kart.bandBuyuk : kart.band;
  const tabela = buyuk ? kart.tabelaBuyuk : kart.tabela;

  const paket = yazi.paket.lineHeight * kis(olcek, 1, PAKET_TAVANI);
  const fiyat = yazi.priceLg.lineHeight * kis(olcek, 1, FIYAT_TAVANI);
  const bant = yazi.data.lineHeight * kis(olcek, 1, DATA_TAVANI);
  // At 1.3× the price row stacks rather than squeezing the value band to
  // nothing, so the two rows cost their sum; below that they share one.
  const fiyatBlogu = buyuk ? fiyat + bant : Math.max(fiyat, bant);

  // The meta rail carries the pickup window, the distance and the walk on
  // one line at the default size — the reviewed look. At the largest step
  // that string is ~254pt of Chivo Mono against ~162pt of card left over
  // once the stock chip has taken its share, so it is allowed a second
  // line there rather than ending in an ellipsis where the walk was.
  const metaSatirSayisi = buyuk ? 2 : 1;
  const meta = Math.max(
    yazi.data.lineHeight * kis(olcek, 1, DATA_TAVANI) * metaSatirSayisi,
    cipYuksekligi(olcek),
  );

  const kaldirim = paket + fiyatBlogu + CUBUK_YUKSEKLIGI + meta + KALDIRIM_ALT_BOSLUK;
  const yukseklik = Math.max(
    kart.yukseklik,
    Math.ceil(KENARLIK + kart.tente + band + tabela + kaldirim),
  );

  return { buyuk, band, tabela, kaldirim, metaSatirSayisi, yukseklik };
}
