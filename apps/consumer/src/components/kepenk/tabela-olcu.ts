import { kis } from "./olcum";

/**
 * Fitting a real shop name onto the sign.
 *
 * "BEŞİKTAŞ MANAV ALİ USTA" is a row in the live database, and at 20pt it
 * is 309pt wide in 304pt of plaque — so it truncated to "BEŞİKTAŞ MANAV
 * ALİ US…". A sign that cannot say the shop's name is a broken sign, and
 * the tabela is the shop's identity, so the name wins and the type size
 * gives way.
 *
 * The fit is computed, not guessed: these are Archivo Black's own advance
 * widths per 1000 units, and design-fonts-glyph-coverage.test.ts checks
 * every one of them against the shipped TTF, so the table cannot drift
 * from the font. `adjustsFontSizeToFit` would have been the lazy answer —
 * it is iOS-only in practice and silently does nothing on Android and
 * web, which is exactly where the truncation would then live.
 *
 * The fit is done at the size the type is actually DRAWN at, not at 1×.
 * The plaque is a fixed object on a fixed Y (§3) and `allowFontScaling`
 * is on (§1.2), so at a raised text size RN multiplies whatever size we
 * hand it — fitting at 1× and drawing at 1.4× is how "YELDEĞİRMENİ
 * PASTANESİ" came back as "YELDEĞİRMENİ PA…" for exactly the user who
 * needed the name most. So the ceiling and the floor are both stated in
 * DRAWN points: the sign grows with the user's text size wherever the
 * plaque has the room ("MODA FIRIN" goes 20 → 28pt), and where it does
 * not, the name wins and the size holds. A legibility floor that is not
 * measured in drawn points is not a legibility floor.
 */

export const TABELA_HARF_GENISLIKLERI: Readonly<Record<string, number>> = Object.freeze({
  A: 778, B: 778, C: 778, D: 778, E: 722, F: 667, G: 833, H: 833, I: 389,
  J: 667, K: 833, L: 667, M: 944, N: 833, O: 833, P: 722, Q: 833, R: 778,
  S: 722, T: 722, U: 833, V: 778, W: 1000, X: 778, Y: 778, Z: 722,
  "Ç": 778, "Ğ": 833, "İ": 389, "Ö": 833, "Ş": 722, "Ü": 833,
  "0": 667, "1": 667, "2": 667, "3": 667, "4": 667, "5": 667, "6": 667,
  "7": 667, "8": 667, "9": 667,
  " ": 333, ".": 333, "-": 333, "&": 889, "'": 278,
});

/** Anything not in the table (a stray accent, a bracket) is assumed wide,
 * so an unknown character shrinks the name rather than overflowing it. */
export const TABELA_VARSAYILAN_HARF = 1000;

export const TABELA_EN_BUYUK = 20;
export const TABELA_EN_KUCUK = 14;
/** `tabela.lg`'s tracking (spec §1.2). */
export const TABELA_ARALIK = -0.2;

export function tabelaGenisligi(metin: string, boyut: number): number {
  let birim = 0;
  for (const harf of metin) {
    birim += TABELA_HARF_GENISLIKLERI[harf] ?? TABELA_VARSAYILAN_HARF;
  }
  const aralik = Math.max(metin.length - 1, 0) * TABELA_ARALIK;
  return (birim / 1000) * boyut + aralik;
}

/** `tabela.lg`'s own dynamic-type ceiling (spec §1.2: "1.4 on the
 * tabela"). The sign may grow this far and no further, which is also the
 * multiplier RN itself will apply — so the fit and the drawing agree. */
export const TABELA_OLCEK_TAVANI = 1.4;

export interface TabelaOlcusu {
  /** The `fontSize` to put in the style. RN multiplies it by the user's
   * (capped) text scale, which is exactly how it becomes `cizilenBoyut`. */
  readonly boyut: number;
  /** Absolute, never a multiplier — Android clips ğ/ş/ç and the İ dot at
   * multiplied leading (§1.2). In style units, like `boyut`. */
  readonly satirYuksekligi: number;
  /** What the reader actually sees, in points on glass. This is the
   * number the 14pt floor and the 20pt ceiling are about. */
  readonly cizilenBoyut: number;
}

/**
 * The largest whole DRAWN point size at which the name fits, between a
 * 14pt floor and 20pt × the user's text scale. Short names are untouched
 * at the ceiling — the sign only quietens for the names that need it,
 * which is the behaviour a signwriter would have.
 *
 * `olcek` is `PixelRatio.getFontScale()`. At 1× this is byte-for-byte the
 * old behaviour; below 1× (the small-text setting) the fit is still done
 * at 1× and RN draws it smaller, which can only ever fit.
 */
export function tabelaOlcusu(
  metin: string,
  kullanilabilir: number,
  olcek = 1,
): TabelaOlcusu {
  const carpan = kis(olcek, 1, TABELA_OLCEK_TAVANI);
  const birimGenislik = tabelaGenisligi(metin, 1000) / 1000; // pt per pt of size
  const aralik = Math.max(metin.length - 1, 0) * TABELA_ARALIK;
  const tavan = TABELA_EN_BUYUK * carpan;
  const ham = birimGenislik > 0 ? (kullanilabilir - aralik) / birimGenislik : tavan;
  const cizilenBoyut = kis(Math.floor(ham), TABELA_EN_KUCUK, tavan);
  return {
    boyut: cizilenBoyut / carpan,
    satirYuksekligi: (cizilenBoyut + 4) / carpan,
    cizilenBoyut,
  };
}
