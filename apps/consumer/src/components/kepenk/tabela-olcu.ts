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

export interface TabelaOlcusu {
  readonly boyut: number;
  readonly satirYuksekligi: number;
}

/**
 * The largest whole point size at which the name fits, down to a 14pt
 * floor. Short names are untouched at 20pt — the sign only quietens for
 * the names that need it, which is the behaviour a signwriter would have.
 */
export function tabelaOlcusu(metin: string, kullanilabilir: number): TabelaOlcusu {
  const birimGenislik = tabelaGenisligi(metin, 1000) / 1000; // pt per pt of size
  const aralik = Math.max(metin.length - 1, 0) * TABELA_ARALIK;
  const ham = birimGenislik > 0 ? (kullanilabilir - aralik) / birimGenislik : TABELA_EN_BUYUK;
  const boyut = kis(Math.floor(ham), TABELA_EN_KUCUK, TABELA_EN_BUYUK);
  return { boyut, satirYuksekligi: boyut + 4 };
}
