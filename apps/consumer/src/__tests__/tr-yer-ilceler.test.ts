import { yerBulunma } from "../components/teslim/tr-yer";
import { ISTANBUL_DISTRICTS } from "../lib/location";

/**
 * The locative suffix, checked against the districts the app actually
 * ships — `ISTANBUL_DISTRICTS` (lib/location.ts) is the list the district
 * picker offers and the list every seeded store's `district` comes from,
 * so it is the real input domain of `yerBulunma()`.
 *
 * Written as a literal table rather than a rule re-implementation: a test
 * that derives the answer the same way the code does proves only that the
 * code agrees with itself. Each expectation below is the form a Turkish
 * speaker writes.
 *
 * The table is keyed off the shipped list, so a 16th district added to
 * lib/location.ts without a decided locative fails HERE rather than
 * printing "Sultangazi'de" or "Sultangazi'da" at random in the discovery
 * header.
 */
const BEKLENEN: Record<string, string> = {
  // Vowel harmony over the LAST vowel.
  Kadıköy: "Kadıköy'de", //     ö -> front
  Üsküdar: "Üsküdar'da", //     a -> back (the initial Ü decides nothing)
  Şişli: "Şişli'de",
  Bakırköy: "Bakırköy'de",
  Bahçelievler: "Bahçelievler'de",
  Ataşehir: "Ataşehir'de",
  Maltepe: "Maltepe'de",
  Kartal: "Kartal'da",
  Ümraniye: "Ümraniye'de", //   e -> front, again despite the initial Ü
  Sarıyer: "Sarıyer'de",
  // Voicing: a name ending in ç f h k p s ş t hardens the d.
  Beşiktaş: "Beşiktaş'ta",
  Fatih: "Fatih'te",
  Pendik: "Pendik'te",
  // Already a possessive compound (bey+oğlu, zeytin+burnu): buffer n.
  Beyoğlu: "Beyoğlu'nda",
  Zeytinburnu: "Zeytinburnu'nda",
};

describe("yerBulunma() over the districts the app ships", () => {
  it.each(ISTANBUL_DISTRICTS.map((ilce) => ilce.name))("%s", (ad) => {
    const beklenen = BEKLENEN[ad];
    expect(beklenen).toBeDefined();
    expect(yerBulunma(ad)).toBe(beklenen);
  });

  it("covers every shipped district and nothing that is not shipped", () => {
    expect(Object.keys(BEKLENEN).sort()).toEqual(
      ISTANBUL_DISTRICTS.map((ilce) => ilce.name).sort(),
    );
  });

  /**
   * The buffer `n` is a fact about the WORD, not about its last letter:
   * these two both end in a vowel and only one of them is a possessive
   * compound. That is why the list exists, and why a name must not be put
   * on it just because it ends in -i/-ı/-u/-ü.
   */
  it("does not give the buffer n to an ordinary vowel-final name", () => {
    expect(yerBulunma("Ankara")).toBe("Ankara'da");
    expect(yerBulunma("Sultanbeyli")).toBe("Sultanbeyli'de");
  });
});
