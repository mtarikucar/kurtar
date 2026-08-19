import { trUpper } from "../design/tr-upper";

/**
 * Spec §1.2 / §5.6. The two cases JS gets wrong on its own are the two
 * this app hits on every single card: the dotted capital İ and the
 * dotless capital I.
 */
describe("trUpper()", () => {
  it.each([
    ["Yeldeğirmeni Pastanesi", "YELDEĞİRMENİ PASTANESİ"],
    ["Moda Fırın", "MODA FIRIN"],
    ["Beşiktaş Manav Ali Usta", "BEŞİKTAŞ MANAV ALİ USTA"],
    ["Levent Fırın", "LEVENT FIRIN"],
    ["istanbul", "İSTANBUL"],
    ["ısparta", "ISPARTA"],
    ["çiğköfteci ömer usta", "ÇİĞKÖFTECİ ÖMER USTA"],
    ["Şişli Büfe", "ŞİŞLİ BÜFE"],
  ])("%s -> %s", (girdi, beklenen) => {
    expect(trUpper(girdi)).toBe(beklenen);
  });

  it("is what JS's own toUpperCase() is not", () => {
    expect("istanbul".toUpperCase()).toBe("ISTANBUL"); // the bug
    expect(trUpper("istanbul")).toBe("İSTANBUL"); // the fix
    expect("Moda Fırın".toUpperCase()).toBe("MODA FIRIN"); // accidentally right
    expect("ısparta".toUpperCase()).toBe("ISPARTA");
  });

  it("is idempotent and leaves already-uppercase Turkish alone", () => {
    const bir = trUpper("Yeldeğirmeni Pastanesi");
    expect(trUpper(bir)).toBe(bir);
    expect(trUpper("ALIŞ PENCERESİ")).toBe("ALIŞ PENCERESİ");
  });

  it("passes through digits, punctuation and the lira sign untouched", () => {
    expect(trUpper("149₺ · 18:30–21:00")).toBe("149₺ · 18:30–21:00");
  });
});
