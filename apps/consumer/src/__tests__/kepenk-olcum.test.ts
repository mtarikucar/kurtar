import {
  degerDolulugu,
  degerOrani,
  degerBandiMetni,
  fiyatMetni,
  H_DK,
  kalanDakika,
  katMetni,
  kepenkP,
  mesafeMetni,
  P_UST,
  sureMetni,
  teklifDurumu,
  yurumeDakikasi,
} from "../components/kepenk/olcum";
import { isikGucu } from "../components/kepenk/olcum";
import { glyphSec } from "../components/kepenk/glyphs";
import {
  TABELA_EN_BUYUK,
  TABELA_EN_KUCUK,
  tabelaGenisligi,
  tabelaOlcusu,
} from "../components/kepenk/tabela-olcu";
import { tenteDeseni, tenteHash, TENTE_DESENLERI } from "../components/kepenk/tente-desen";
import { saatBulunma, saatEki } from "../components/kepenk/tr-saat";
import { trUpper } from "../design/tr-upper";

describe("kepenkP() — the gauge (§2)", () => {
  it.each([
    ["three hours out — a 5pt lintel, the shop is wide open", 180, 0.08],
    ["90 dk", 90, 0.5],
    ["56 dk", 56, 0.69],
    ["20 dk — capped", 20, P_UST],
    ["5 dk — still capped", 5, P_UST],
  ])("%s -> %s", (_ad, kalanDk, beklenen) => {
    expect(kepenkP(kalanDk, "acik")).toBeCloseTo(beklenen, 2);
  });

  it("puts the clamp OUTSIDE the subtraction", () => {
    // D3's spec had it inside and produced 0.22 at three hours — a
    // quarter-closed shutter on an offer with three hours to run.
    const yanlis = 1 - Math.min(Math.max(180 / H_DK, 0.08), P_UST);
    expect(yanlis).toBeCloseTo(0.22, 2);
    expect(kepenkP(180, "acik")).toBeCloseTo(0.08, 2);
  });

  it("never lets an open offer past the cap, at any horizon", () => {
    for (let dk = 0; dk <= 600; dk += 1) {
      const p = kepenkP(dk, "acik");
      expect(p).toBeGreaterThanOrEqual(0.08);
      expect(p).toBeLessThanOrEqual(P_UST);
    }
  });

  it("closes monotonically as time runs out", () => {
    let onceki = kepenkP(600, "acik");
    for (let dk = 599; dk >= 0; dk -= 1) {
      const p = kepenkP(dk, "acik");
      expect(p).toBeGreaterThanOrEqual(onceki);
      onceki = p;
    }
  });

  it("reserves 1.0 for the one state allowed past the cap", () => {
    expect(kepenkP(0, "tukendi")).toBe(1);
    expect(kepenkP(500, "tukendi")).toBe(1);
    expect(kepenkP(500, "acilmadi")).toBe(P_UST);
  });

  it("means the same thing on every card in the list", () => {
    // A manav on a 30-minute window and a fırın on a five-hour one both
    // read 0.69 at 56 minutes: the gauge is normalised to absolute
    // minutes, never to the shop's own window.
    expect(kepenkP(56, "acik")).toBe(kepenkP(56, "acik"));
    expect(kepenkP(56, "acik")).toBeCloseTo(0.69, 2);
  });
});

describe("teklifDurumu() and kalanDakika()", () => {
  const basla = new Date("2026-08-19T15:30:00Z");
  const bit = new Date("2026-08-19T18:00:00Z");

  it("reads the window and the stock", () => {
    expect(teklifDurumu(3, basla, bit, new Date("2026-08-19T15:00:00Z"))).toBe("acilmadi");
    expect(teklifDurumu(3, basla, bit, new Date("2026-08-19T16:00:00Z"))).toBe("acik");
    expect(teklifDurumu(0, basla, bit, new Date("2026-08-19T16:00:00Z"))).toBe("tukendi");
    expect(teklifDurumu(3, basla, bit, new Date("2026-08-19T18:30:00Z"))).toBe("tukendi");
  });

  it("floors minutes and never goes negative", () => {
    expect(kalanDakika(new Date("2026-08-19T17:04:20Z"), bit)).toBe(55);
    expect(kalanDakika(new Date("2026-08-19T19:00:00Z"), bit)).toBe(0);
  });
});

describe("değer çubuğu — fuller is a better deal (§3)", () => {
  it("matches the spec's two worked examples", () => {
    const yeldegirmeni = degerOrani(18000, 30000, 14900);
    expect(yeldegirmeni).toBeCloseTo(1.61, 2);
    expect(degerDolulugu(yeldegirmeni)).toBeCloseTo(0.2, 2);
    expect(katMetni(yeldegirmeni)).toBe("×1,6");

    const modaFirin = degerOrani(18000, 30000, 6900);
    expect(modaFirin).toBeCloseTo(3.48, 2);
    expect(degerDolulugu(modaFirin)).toBeCloseTo(0.83, 2);
    expect(katMetni(modaFirin)).toBe("×3,5");
  });

  it("fills FULLER for the better deal, which is the bug D3 shipped", () => {
    const iyi = degerDolulugu(degerOrani(18000, 30000, 6900));
    const zayif = degerDolulugu(degerOrani(18000, 30000, 14900));
    expect(iyi).toBeGreaterThan(zayif);
    // The inverted version — price / mid-value — would have said the
    // opposite.
    expect(6900 / 24000).toBeLessThan(14900 / 24000);
  });

  it("stays inside the track at both ends", () => {
    expect(degerDolulugu(degerOrani(10000, 10000, 100000))).toBe(0.04);
    expect(degerDolulugu(degerOrani(900000, 900000, 1000))).toBe(1);
  });
});

describe("Turkish formatting (§1.2)", () => {
  it("puts ₺ after the numeral with no space", () => {
    expect(fiyatMetni(14900)).toBe("149₺");
    expect(fiyatMetni(6900)).toBe("69₺");
    expect(fiyatMetni(124900)).toBe("1.249₺");
    expect(fiyatMetni(4990)).toBe("49,90₺");
  });

  it("prints a value BAND, never a fabricated struck price", () => {
    expect(degerBandiMetni(28000, 38000)).toBe("280–380₺");
    expect(degerBandiMetni(15000, 22000)).toBe("150–220₺");
  });

  it("formats distance and duration the Turkish way", () => {
    expect(mesafeMetni(405)).toBe("405 m");
    expect(mesafeMetni(1244)).toBe("1,2 km");
    expect(mesafeMetni(6114)).toBe("6,1 km");
    expect(sureMetni(146)).toEqual({ saat: 2, dakika: 26 });
    expect(sureMetni(56)).toEqual({ saat: 0, dakika: 56 });
    expect(yurumeDakikasi(405)).toBe(5);
    expect(yurumeDakikasi(30)).toBe(1);
  });
});

describe("Turkish clock suffixes", () => {
  it.each([
    ["18:30", "'da"],
    ["21:00", "'de"],
    ["17:45", "'te"],
    ["19:00", "'da"],
    ["16:00", "'da"],
    ["20:00", "'de"],
    ["18:00", "'de"],
    ["09:40", "'ta"],
  ])("%s takes %s", (saat, ek) => {
    expect(saatEki(saat)).toBe(ek);
  });

  it("builds the string the pill shows", () => {
    expect(saatBulunma("18:30")).toBe("18:30'da");
    expect(saatBulunma("21:00")).toBe("21:00'de");
  });
});

describe("tente — the hashed identity mark (§3)", () => {
  it("is deterministic per shop, and stable across runs", () => {
    expect(tenteHash("kd-demo-store-1")).toBe(tenteHash("kd-demo-store-1"));
    expect(tenteDeseni("kd-demo-store-1").ad).toBe(tenteDeseni("kd-demo-store-1").ad);
    expect(tenteDeseni("kd-demo-store-1").ad).not.toBe(
      tenteDeseni("kd-demo-store-2").ad,
    );
  });

  it("only ever lands on the six real awning combinations", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(TENTE_DESENLERI).toContain(tenteDeseni(`dukkan-${i}`));
    }
  });

  it("spreads the four seeded shops across different awnings", () => {
    const dukkanlar = [
      "kd-demo-store-1",
      "kd-demo-store-2",
      "kd-demo-store-5",
      "kd-demo-store-6",
    ];
    const adlar = dukkanlar.map((id) => tenteDeseni(id).ad);
    expect(new Set(adlar).size).toBeGreaterThanOrEqual(3);
  });
});

describe("glyphSec() — we draw the shop's tools (§3)", () => {
  it.each([
    ["BAKERY", "Yeldeğirmeni Pastanesi", "pastane"],
    ["BAKERY", "Moda Fırın", "firin"],
    ["BAKERY", "Levent Fırın", "firin"],
    ["PRODUCE", "Beşiktaş Manav Ali Usta", "manav"],
    ["MEAL", "Kadıköy Mutfak", "mutfak"],
    ["GROCERY", "Semt Market", "market"],
    ["OTHER", "Bir Yer", "kafe"],
    ["BILINMEYEN", "Bir Yer", "kafe"],
  ])("%s / %s -> %s", (kategori, ad, beklenen) => {
    expect(glyphSec(kategori, ad)).toBe(beklenen);
  });
});

describe("isikGucu() — the other half of the gauge", () => {
  it("burns HOTTER as the gap narrows, not dimmer", () => {
    const ucSaat = isikGucu(kepenkP(180, "acik"), "acik");
    const doksanDk = isikGucu(kepenkP(90, "acik"), "acik");
    const yirmiDk = isikGucu(kepenkP(20, "acik"), "acik");
    expect(ucSaat).toBeLessThan(doksanDk);
    expect(doksanDk).toBeLessThan(yirmiDk);
    expect(yirmiDk).toBeGreaterThan(0.9);
    // …and the urgent one is the brightest thing in the list.
    expect(yirmiDk / ucSaat).toBeGreaterThan(2);
  });

  it("goes dark for the two states that are shut and NOT closing", () => {
    // This is what makes "hasn't opened yet" and "20 minutes left" two
    // different pictures rather than two identical shutters: one is shut
    // and dark, the other is shut and blazing.
    expect(isikGucu(kepenkP(0, "acilmadi"), "acilmadi")).toBe(0);
    expect(isikGucu(kepenkP(0, "tukendi"), "tukendi")).toBe(0);
    expect(isikGucu(kepenkP(20, "acik"), "acik")).toBeGreaterThan(0);
  });

  it("never goes past full or below its floor", () => {
    for (let dk = 0; dk <= 600; dk += 1) {
      const guc = isikGucu(kepenkP(dk, "acik"), "acik");
      expect(guc).toBeGreaterThanOrEqual(0.34);
      expect(guc).toBeLessThanOrEqual(1);
    }
  });
});

describe("tabelaOlcusu() — the sign fits the shop's name (§3)", () => {
  const PLAKA_ICI = 358 - 24 - 12 - 6 - 12;

  it("leaves short names at full size", () => {
    expect(tabelaOlcusu("MODA FIRIN", PLAKA_ICI).boyut).toBe(TABELA_EN_BUYUK);
    expect(tabelaOlcusu("LEVENT FIRIN", PLAKA_ICI).boyut).toBe(TABELA_EN_BUYUK);
  });

  it("quietens the one real name that did not fit, rather than truncating it", () => {
    // 309pt of type in 304pt of plaque at 20pt — this is the row that
    // rendered as "BEŞİKTAŞ MANAV ALİ US…".
    expect(tabelaGenisligi("BEŞİKTAŞ MANAV ALİ USTA", TABELA_EN_BUYUK)).toBeGreaterThan(
      PLAKA_ICI,
    );
    const olcu = tabelaOlcusu("BEŞİKTAŞ MANAV ALİ USTA", PLAKA_ICI);
    expect(olcu.boyut).toBeLessThan(TABELA_EN_BUYUK);
    expect(tabelaGenisligi("BEŞİKTAŞ MANAV ALİ USTA", olcu.boyut)).toBeLessThanOrEqual(
      PLAKA_ICI,
    );
  });

  it.each([
    "Yeldeğirmeni Pastanesi",
    "Beşiktaş Manav Ali Usta",
    "Moda Fırın",
    "Levent Fırın",
    "Kadıköy Çiğköfteci Ömer Usta & Oğulları",
  ])("fits %s", (ad) => {
    const yazit = trUpper(ad);
    const olcu = tabelaOlcusu(yazit, PLAKA_ICI);
    expect(olcu.boyut).toBeGreaterThanOrEqual(TABELA_EN_KUCUK);
    if (olcu.boyut > TABELA_EN_KUCUK) {
      expect(tabelaGenisligi(yazit, olcu.boyut)).toBeLessThanOrEqual(PLAKA_ICI);
    }
    expect(olcu.satirYuksekligi).toBeGreaterThan(olcu.boyut);
  });

  it("never goes below the floor, even for a name nobody should have", () => {
    const olcu = tabelaOlcusu("A".repeat(120), PLAKA_ICI);
    expect(olcu.boyut).toBe(TABELA_EN_KUCUK);
  });
});
