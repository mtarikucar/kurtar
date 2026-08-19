import { kontrastOrani } from "../design/kontrast";
import { PALETLER, type Faz, type Palet } from "../design/tokens";

/**
 * Contrast assertions over the token pairs (spec §6, Phase 0).
 *
 * §1.1 publishes a measured ratio for almost every pair it introduces;
 * these tests hold the palette to those numbers, and hold the two phases
 * the spec does NOT measure (twilight, and the parts of the day palette it
 * leaves implied) to the same floors.
 */

/** WCAG AA for body text. Everything decision-critical in this app is
 * 12pt or larger but well under 18pt, so this is the floor that applies. */
const YAZI_TABANI = 4.5;
/** WCAG AA for non-text objects (the lit stock squares, the shutter
 * against the card, a 1pt border). */
const GRAFIK_TABANI = 3;

const FAZLAR: readonly Faz[] = ["gece", "alacakaranlik", "gunduz"];

describe.each(FAZLAR)("%s palette floors", (ad) => {
  const p: Palet = PALETLER[ad];

  it.each([
    ["primary type on the card", () => kontrastOrani(p.yaziAna, p.yuzeyKaldirim)],
    ["primary type on the ground", () => kontrastOrani(p.yaziAna, p.bgAsfalt)],
    ["secondary type on the card", () => kontrastOrani(p.yaziSis, p.yuzeyKaldirim)],
    ["sodium type on the card", () => kontrastOrani(p.sodyumYazi, p.yuzeyKaldirim)],
    ["ink on a sodium fill", () => kontrastOrani(p.sodyumMurekkep, p.sodyumDolgu)],
    ["ink on an awning-red fill", () => kontrastOrani(p.tenteMurekkep, p.tenteDolgu)],
    [
      "awning red as type, on the one surface this phase allows it",
      () => kontrastOrani(p.tenteYazi, p.tenteYaziZemini),
    ],
    ["data type in the time pill", () => kontrastOrani(p.hapYazi, p.hapZemin)],
    ["the shop name on its plaque", () => kontrastOrani(p.plakaYazi, p.plakaZemin)],
  ])("%s clears 4.5:1", (_ad, olc) => {
    expect(olc()).toBeGreaterThanOrEqual(YAZI_TABANI);
  });

  it.each([
    ["a lit stock square on the card", () => kontrastOrani(p.stokIsik, p.yuzeyKaldirim)],
    ["the shutter against the card", () => kontrastOrani(p.metalCinko, p.plakaZemin)],
  ])("%s clears 3:1", (_ad, olc) => {
    expect(olc()).toBeGreaterThanOrEqual(GRAFIK_TABANI);
  });

  it("separates the card from the ground it sits on", () => {
    // Not a WCAG floor — storefronts sit on a dark street with no
    // separators and no shadow (spec §3), so the only thing telling the
    // eye where a card ends is this difference. The day phases carry a
    // 1pt border precisely because the difference alone is 1.27:1.
    const fark = kontrastOrani(p.yuzeyKaldirim, p.bgAsfalt);
    if (p.kartCizgiKalinlik === 0) {
      expect(fark).toBeGreaterThan(1.1);
    } else {
      expect(kontrastOrani(p.kartCizgi, p.bgAsfalt)).toBeGreaterThan(1.2);
    }
  });
});

describe("the ratios §1.1 publishes", () => {
  const gece = PALETLER.gece;
  const gunduz = PALETLER.gunduz;

  it.each([
    ["ivory on the night card", gece.yaziAna, gece.yuzeyKaldirim, 12.84],
    ["ivory on the night ground", gece.yaziAna, gece.bgAsfalt, 14.44],
    ["mist on the night card", gece.yaziSis, gece.yuzeyKaldirim, 7.01],
    ["sodium on the night card", gece.sodyumYazi, gece.yuzeyKaldirim, 8.83],
    ["asphalt ink on sodium", gece.sodyumMurekkep, gece.sodyumDolgu, 9.93],
    ["awning red on the night ground", gece.tenteYazi, gece.bgAsfalt, 4.93],
    ["ink on the day ground", gunduz.yaziAna, gunduz.bgAsfalt, 11.37],
    ["mist on the day card", gunduz.yaziSis, gunduz.yuzeyKaldirim, 5.85],
    ["dark amber on the day card", gunduz.sodyumYazi, gunduz.yuzeyKaldirim, 5.55],
    ["dark awning red on the day card", gunduz.tenteYazi, gunduz.yuzeyKaldirim, 5.41],
  ])("%s is %s:1", (_ad, on, alt, beklenen) => {
    expect(kontrastOrani(on, alt)).toBeCloseTo(beklenen, 1);
  });

  /**
   * Two numbers in §1.1 do not survive measurement, and the hex values —
   * not the printed ratios — are the source of truth:
   *
   *  • "text.primary … 14.6:1 on card" is the same pair as ivory-on-night-
   *    ground inverted, so it is 14.44:1.
   *  • "1pt #A9B5B7 border (1.27:1 against ground)" measures 1.34:1; the
   *    1.27 is the ivory CARD against that ground, which is exactly the
   *    difference the border exists to rescue.
   */
  it("records the two published ratios that measure differently", () => {
    expect(kontrastOrani(gunduz.yaziAna, gunduz.yuzeyKaldirim)).toBeCloseTo(14.44, 1);
    expect(kontrastOrani(gunduz.kartCizgi, gunduz.bgAsfalt)).toBeCloseTo(1.34, 1);
    expect(kontrastOrani(gunduz.yuzeyKaldirim, gunduz.bgAsfalt)).toBeCloseTo(1.27, 1);
  });
});

describe("the law: red is never type on a card (§1.1)", () => {
  it("is a rule because the fill colour genuinely fails there", () => {
    const gece = PALETLER.gece;
    expect(kontrastOrani(gece.tenteDolgu, gece.yuzeyKaldirim)).toBeCloseTo(4.38, 1);
    expect(kontrastOrani(gece.tenteDolgu, gece.yuzeyKaldirim)).toBeLessThan(YAZI_TABANI);
    // …which is why every red in the night palette is a FILL with
    // #12181F ink on it, and why the only red type token is the one
    // scoped to the ground.
    expect(kontrastOrani(gece.tenteMurekkep, gece.tenteDolgu)).toBeGreaterThanOrEqual(
      YAZI_TABANI,
    );
    expect(kontrastOrani(gece.tenteYazi, gece.tenteYaziZemini)).toBeGreaterThanOrEqual(
      YAZI_TABANI,
    );
    expect(gece.tenteYaziZemini).toBe(gece.bgAsfalt);
  });
});

describe("the twilight palette the spec leaves unmeasured", () => {
  const ara = PALETLER.alacakaranlik;

  it("keeps the spec's card ivory", () => {
    expect(ara.yuzeyKaldirim).toBe("#E3DAC8");
  });

  /**
   * The spec's twilight ground (#6E7A80) cannot carry small type at all:
   * pure black tops out at 4.76:1 there and this palette's darkest ink
   * (#12181F) reaches 4.05:1. The ground is lightened to #7A868C, the
   * smallest change that puts ground-level type back over the floor the
   * other two phases hold.
   */
  it("lightens the ground until ground-level type clears the floor", () => {
    expect(kontrastOrani("#12181F", "#6E7A80")).toBeLessThan(YAZI_TABANI);
    expect(kontrastOrani(ara.yaziAna, ara.bgAsfalt)).toBeGreaterThanOrEqual(YAZI_TABANI);
  });
});

describe("no green anywhere in the palette (§1.1 / §5.9)", () => {
  it.each(FAZLAR)("%s", (ad) => {
    const p = PALETLER[ad];
    const hexler = Object.values(p).filter(
      (v): v is string => typeof v === "string" && v.startsWith("#"),
    );
    for (const hex of hexler) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      // "Green" here means a green that reads AS green: a green channel
      // clearly dominant over both others. The zinc family is very
      // slightly green-leaning (#5E6A67), which is what galvanised steel
      // looks like, and stays well inside this bound.
      const yesillik = g - Math.max(r, b);
      expect(yesillik).toBeLessThan(12);
    }
  });
});
