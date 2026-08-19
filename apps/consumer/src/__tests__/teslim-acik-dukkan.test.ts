import { kontrastOrani } from "../design/kontrast";
import { PALETLER, type Faz, type Palet } from "../design/tokens";
import {
  ESIK,
  isikAltindaZemin,
  isikRengi,
  LAMBA,
  lambaAlfasi,
  sicaklik,
  TAVAN,
  tavanAlfasi,
  TEZGAH,
  tezgahAlfasi,
  toplamAlfa,
} from "../components/teslim/dukkan-isigi";
import { heroTabelaBoyutu } from "../components/teslim/HeroTabela";

/**
 * The opened shop's light (spec §4.4 / §4.5, and the review that sent the
 * first pass back for rendering the vacated area as flat dead ground).
 *
 * Two things a later "warm it up" or "calm it down" would break, held
 * here rather than in a screenshot: the room is never unlit, and it is
 * never brighter than the type in front of it can survive.
 */

const FAZLAR: readonly Faz[] = ["gece", "alacakaranlik", "gunduz"];

/** The tallest opening either screen gives the room: a full 844pt frame
 * on the confirmation. The redeem's opening is ~704. */
const ACIKLIK = 844;

/** Depths where type actually lands on these two screens, as a fraction
 * of the opening: the clock, the date, the code, the ticket, the counter
 * line and the undo under the CTA. */
const YAZI_DERINLIKLERI = [0.04, 0.08, 0.14, 0.25, 0.45, 0.7, 0.86, 0.98];

/** WCAG AA for the body sizes this app sets. */
const YAZI_TABANI = 4.5;
/** What §1.1 publishes for primary ivory, and what the palette test holds
 * it to on the card. */
const ANA_TABANI = 7;

describe("the room is lit, everywhere", () => {
  it("never falls to zero — the back of a lit shop is dim, not black", () => {
    for (let oran = 0; oran <= 1.0001; oran += 0.05) {
      expect(toplamAlfa(oran, ACIKLIK)).toBeGreaterThan(0);
    }
    expect(TAVAN[TAVAN.length - 1].alfa).toBeGreaterThan(0);
  });

  it("is brightest at the lintel and falls away into the depth", () => {
    expect(tavanAlfasi(0)).toBe(TAVAN[0].alfa);
    let onceki = tavanAlfasi(0);
    for (let oran = 0.05; oran <= 1.0001; oran += 0.05) {
      const simdiki = tavanAlfasi(oran);
      expect(simdiki).toBeLessThanOrEqual(onceki + 1e-9);
      onceki = simdiki;
    }
    expect(tavanAlfasi(1)).toBe(TAVAN[TAVAN.length - 1].alfa);
  });

  it("clamps outside the opening rather than extrapolating", () => {
    expect(tavanAlfasi(-3)).toBe(TAVAN[0].alfa);
    expect(tavanAlfasi(9)).toBe(TAVAN[TAVAN.length - 1].alfa);
  });

  it("hangs the lamp inside the lintel and lets it die before the sill", () => {
    expect(lambaAlfasi(LAMBA.merkez)).toBe(LAMBA.cekirdek);
    expect(lambaAlfasi(LAMBA.merkez + LAMBA.yaricap)).toBe(0);
    expect(lambaAlfasi(1)).toBe(0);
    expect(lambaAlfasi(0.3)).toBeLessThan(lambaAlfasi(0.2));
  });

  it("pools the counter's light over the bottom third and nowhere else", () => {
    expect(tezgahAlfasi(0.2, ACIKLIK)).toBe(0);
    expect(tezgahAlfasi(0.5, ACIKLIK)).toBe(0);
    expect(tezgahAlfasi(0.9, ACIKLIK)).toBeGreaterThan(0);
    expect(tezgahAlfasi(1, ACIKLIK)).toBeCloseTo(TEZGAH.alfa, 5);
  });

  it("keeps the counter a counter on a short opening rather than the whole room", () => {
    // 300pt of opening: the 140pt floor applies, not 34% of it.
    expect(tezgahAlfasi(1 - 140 / 300 - 0.01, 300)).toBe(0);
    expect(tezgahAlfasi(1, 300)).toBeCloseTo(TEZGAH.alfa, 5);
  });

  it("ends every fade at rgba(R,G,B,0), never 'transparent' (§5.7)", () => {
    for (const ad of FAZLAR) {
      const bitis = isikRengi(PALETLER[ad], 0);
      expect(bitis).toBe(`rgba(${PALETLER[ad].isikRgb},0.000)`);
      expect(bitis).not.toContain("transparent");
    }
  });
});

describe.each(FAZLAR)("%s — the shop reads as lit", (ad) => {
  const palet: Palet = PALETLER[ad];
  const zemin = palet.bgDerin;

  it("is warm where the dead ground was cold, at the lintel and in the depth", () => {
    const lintel = isikAltindaZemin(palet, toplamAlfa(0.02, ACIKLIK));
    const derinlik = isikAltindaZemin(palet, toplamAlfa(0.55, ACIKLIK));
    const tezgahUstu = isikAltindaZemin(palet, toplamAlfa(0.98, ACIKLIK));

    // Contrast cannot say this — in daylight the wash barely moves the
    // luminance — so the measure is warmth itself.
    expect(sicaklik(lintel) - sicaklik(zemin)).toBeGreaterThan(25);
    expect(sicaklik(derinlik) - sicaklik(zemin)).toBeGreaterThan(10);
    expect(sicaklik(tezgahUstu) - sicaklik(zemin)).toBeGreaterThan(15);
  });

  it("has a direction: the lintel is hotter than the depth", () => {
    const lintel = isikAltindaZemin(palet, toplamAlfa(0.02, ACIKLIK));
    const derinlik = isikAltindaZemin(palet, toplamAlfa(0.55, ACIKLIK));
    expect(sicaklik(lintel)).toBeGreaterThan(sicaklik(derinlik));
  });

  it("scales the whole room by how hard this phase's shop burns", () => {
    expect(isikRengi(palet, 0.5)).toBe(
      `rgba(${palet.isikRgb},${(0.5 * palet.isikSiddeti).toFixed(3)})`,
    );
  });

  it("keeps the sill legible as a line without writing anything on it", () => {
    expect(ESIK.opaklik * palet.isikSiddeti).toBeGreaterThan(0.4);
    expect(ESIK.kalinlik).toBeLessThanOrEqual(2);
  });
});

/**
 * The legibility budget.
 *
 * The floors are asserted CONDITIONALLY on the bare ground already
 * meeting them, and that is deliberate rather than lenient: `bg.derin` is
 * the one ground §1.1 never measures type against, and in the day and
 * twilight palettes `text.sis` is already under 4.5:1 on it before any
 * light is added (see the build log). The rule this light must obey is
 * that it is never the reason a floor is missed — and the pre-existing
 * hole is pinned by its own test below, so shrinking it is a visible
 * change rather than a silent one.
 */
describe.each(FAZLAR)("%s — the light is bounded by the type in front of it", (ad) => {
  const palet: Palet = PALETLER[ad];

  it.each(YAZI_DERINLIKLERI)("does not cost secondary type at depth %s", (oran) => {
    const taban = kontrastOrani(palet.yaziSis, palet.bgDerin);
    const isikli = kontrastOrani(
      palet.yaziSis,
      isikAltindaZemin(palet, toplamAlfa(oran, ACIKLIK)),
    );
    if (taban >= YAZI_TABANI) expect(isikli).toBeGreaterThanOrEqual(YAZI_TABANI);
  });

  it.each(YAZI_DERINLIKLERI)("does not cost primary type at depth %s", (oran) => {
    const taban = kontrastOrani(palet.yaziAna, palet.bgDerin);
    const isikli = kontrastOrani(
      palet.yaziAna,
      isikAltindaZemin(palet, toplamAlfa(oran, ACIKLIK)),
    );
    if (taban >= ANA_TABANI) expect(isikli).toBeGreaterThanOrEqual(ANA_TABANI);
  });
});

it("pins the grounds that fail their floor UNLIT — the light did not break these", () => {
  const kirik: string[] = [];
  for (const ad of FAZLAR) {
    const p = PALETLER[ad];
    if (kontrastOrani(p.yaziSis, p.bgDerin) < YAZI_TABANI) kirik.push(`${ad}/yaziSis`);
    if (kontrastOrani(p.yaziAna, p.bgDerin) < ANA_TABANI) kirik.push(`${ad}/yaziAna`);
  }
  // Reported in docs/design/build-log-teslim.md: fixing it is a palette
  // change, and the palette is not this branch's to change.
  expect(kirik).toEqual([
    "alacakaranlik/yaziSis",
    "alacakaranlik/yaziAna",
    "gunduz/yaziSis",
  ]);
});

describe("the sign gives way to the name (§4.5)", () => {
  it("keeps a short name at the largest size", () => {
    expect(heroTabelaBoyutu("MODA FIRIN", 340)).toBe(44);
  });

  it("quietens a long one rather than truncating it", () => {
    const uzun = heroTabelaBoyutu("BEŞİKTAŞ MANAV ALİ USTA", 340);
    expect(uzun).toBeLessThan(44);
    expect(uzun).toBeGreaterThanOrEqual(22);
  });

  it("never goes below the floor, whatever the name", () => {
    expect(heroTabelaBoyutu("YELDEĞİRMENİ PASTANESİ VE UNLU MAMULLERİ", 120)).toBe(22);
  });
});
