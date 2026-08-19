/**
 * Turkish locative for a place name — "Kadıköy'de", "Beşiktaş'ta",
 * "Üsküdar'da".
 *
 * The handover's closing line is `Kadıköy'de 13. kepenk` (spec §4.5), and
 * a fixed `'da` gets a third of İstanbul's districts wrong. The rule is
 * mechanical and worth doing properly, because getting it wrong is the
 * single loudest way an app reads as translated rather than written:
 *
 *  • the vowel follows the LAST vowel in the name — back (a ı o u) takes
 *    'da, front (e i ö ü) takes 'de;
 *  • the consonant follows the last LETTER — a voiceless one (f s t k ç
 *    ş h p) hardens 'd into 't'.
 *
 * A name with no vowel at all (an initialism) falls back to the back
 * vowel, which is what Turkish does with letter names read aloud.
 */

const ARKA_UNLULER = "aıouâû";
const ON_UNLULER = "eiöüî";
const SERT_UNSUZLER = "fstkçşhp";

/** The Turkish alphabet's own lowercase, without `.toLowerCase()`'s
 * locale trap: `'I'.toLowerCase()` is `'i'` in most locales but `'ı'` in
 * Turkish, and the two are different letters. Only the pairs that differ
 * from the invariant mapping need naming. */
const KUCUK: Record<string, string> = {
  I: "ı",
  İ: "i",
  Ğ: "ğ",
  Ü: "ü",
  Ş: "ş",
  Ö: "ö",
  Ç: "ç",
};

function kucult(harf: string): string {
  return KUCUK[harf] ?? harf.toLocaleLowerCase("tr");
}

/**
 * Names that are already a possessive construction take a buffer `n`
 * before the case suffix — "Zeytinburnu'nda", not "Zeytinburnu'da". That
 * is a fact about the WORD (burun + u), not about its spelling, so it
 * cannot be derived and is listed instead: "Beyoğlu" (bey + oğlu) and
 * "Ankara" both end in a vowel and only the first takes the n.
 *
 * The list is complete for where kurtar operates. Across all 39 İstanbul
 * districts exactly three are possessive compounds — Beyoğlu (bey+oğlu),
 * Zeytinburnu (zeytin+burnu) and Beylikdüzü (beylik+düzü) — and
 * lib/location.ts's ISTANBUL_DISTRICTS is the list the picker offers and
 * every seeded store's district comes from. `src/__tests__/
 * tr-yer-ilceler.test.ts` pins the locative of every shipped district, so
 * a 16th one cannot be added without deciding this.
 *
 * NOT on the list: "Sultanbeyli", which was, and was wrong —
 * "Sultanbeyli'de". Its -li is the ordinary derivational suffix (Sultan
 * Bey + li), not a possessive; a possessive would be "Sultanbeyi". A name
 * belongs here because of how it is BUILT, never because it ends in a
 * vowel.
 */
const TAMLAMALI = new Set(["beyoğlu", "zeytinburnu", "beylikdüzü"]);

function kucultHepsi(ad: string): string {
  return [...ad].map(kucult).join("");
}

export function yerEki(ad: string): string {
  const harfler = [...ad.trim()].map(kucult);
  const tampon = TAMLAMALI.has(kucultHepsi(ad.trim())) ? "n" : "";
  let kalin = true;
  for (let i = harfler.length - 1; i >= 0; i -= 1) {
    const harf = harfler[i] ?? "";
    if (ARKA_UNLULER.includes(harf)) {
      kalin = true;
      break;
    }
    if (ON_UNLULER.includes(harf)) {
      kalin = false;
      break;
    }
  }
  const son = harfler[harfler.length - 1] ?? "";
  // A buffer `n` is always followed by the soft `d`.
  const unsuz = tampon !== "" ? "d" : SERT_UNSUZLER.includes(son) ? "t" : "d";
  return `'${tampon}${unsuz}${kalin ? "a" : "e"}`;
}

/** "Kadıköy'de", "Beşiktaş'ta". */
export function yerBulunma(ad: string): string {
  return `${ad}${yerEki(ad)}`;
}
