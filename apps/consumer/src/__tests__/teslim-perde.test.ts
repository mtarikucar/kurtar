import { Easing } from "react-native";
import {
  ACIK_KALMA_SN,
  KALDIRMA_ESIGI,
  KILITLI_TAVAN,
  KOD_ON_EKI,
  UYARI_DK,
  YARDIM_ESIGI,
  direncliMesafe,
  kaldirilabilir,
  kaldirmaMesafesi,
  kaldirmaOrani,
  kaldirmaYeterli,
  kapanmayaDk,
  kepenkIniyorMu,
  kodHeceleme,
  kodParcalari,
  pencereDurumu,
  pencereOrani,
  tikSayisi,
  tikZamanlari,
} from "../components/teslim/perde";
import { yerBulunma, yerEki } from "../components/teslim/tr-yer";
import { m } from "../design/tokens";

/**
 * The redeem ritual's arithmetic (spec §4.5). None of this needs a device
 * to be right, and all of it is wrong in a way nobody would notice on one
 * — a threshold off by a hand's width, a haptic schedule that accelerates
 * instead of decelerating, a locative suffix that makes the app read as
 * translated.
 */

describe("the swipe threshold (§4.5)", () => {
  it("is 140pt UP, measured in the direction a shutter travels", () => {
    expect(KALDIRMA_ESIGI).toBe(140);
    // `dy` is negative upward. A downward drag is not a lift at all.
    expect(kaldirmaMesafesi(-140)).toBe(140);
    expect(kaldirmaMesafesi(200)).toBe(0);
  });

  it("commits at exactly the threshold and not a point before it", () => {
    expect(kaldirmaYeterli(-139.9)).toBe(false);
    expect(kaldirmaYeterli(-140)).toBe(true);
    expect(kaldirmaYeterli(-400)).toBe(true);
    expect(kaldirmaYeterli(0)).toBe(false);
    expect(kaldirmaYeterli(300)).toBe(false);
  });

  it("reports progress bounded to 0..1 so the metal never outruns the finger", () => {
    expect(kaldirmaOrani(0)).toBe(0);
    expect(kaldirmaOrani(-70)).toBeCloseTo(0.5, 5);
    expect(kaldirmaOrani(-140)).toBe(1);
    expect(kaldirmaOrani(-1000)).toBe(1);
  });
});

describe("the bolted shutter (§4.5 Guards)", () => {
  it("moves — a dead control reads as a broken screen — but stiffens", () => {
    expect(direncliMesafe(-10)).toBeGreaterThan(0);
    expect(direncliMesafe(-10)).toBeLessThan(10);
    // Monotonic: pulling harder always moves it a little further.
    expect(direncliMesafe(-200)).toBeGreaterThan(direncliMesafe(-100));
  });

  it("can NEVER reach the threshold, at any drag distance", () => {
    for (const dy of [-50, -140, -400, -2000, -100000]) {
      expect(direncliMesafe(dy)).toBeLessThan(KILITLI_TAVAN);
      expect(direncliMesafe(dy)).toBeLessThan(KALDIRMA_ESIGI);
    }
  });
});

describe("the haptic split (§4.5)", () => {
  it("is nine on iOS and three everywhere else — nine inside 700ms smear into one buzz on an ERM motor", () => {
    expect(tikSayisi("ios")).toBe(9);
    expect(tikSayisi("android")).toBe(3);
    expect(tikSayisi("web")).toBe(3);
  });

  it("lands its last tick exactly when the sign lights", () => {
    for (const adet of [3, 9]) {
      const zamanlar = tikZamanlari(adet, m.roll);
      expect(zamanlar).toHaveLength(adet);
      expect(zamanlar[zamanlar.length - 1]).toBe(m.roll);
    }
  });

  it("DECELERATES: every interval is longer than the one before it", () => {
    for (const adet of [3, 9]) {
      const zamanlar = tikZamanlari(adet, m.roll);
      const araliklar = zamanlar.map(
        (an, i) => an - (i === 0 ? 0 : (zamanlar[i - 1] as number)),
      );
      for (let i = 1; i < araliklar.length; i += 1) {
        expect(araliklar[i] as number).toBeGreaterThan(araliklar[i - 1] as number);
      }
    }
  });

  it("is spaced evenly in DISTANCE along the very curve the roll runs", () => {
    // One tick per equal slice of travel: that is what makes it read as
    // corrugations passing the lip rather than as a metronome.
    const egri = Easing.bezier(0.16, 0.84, 0.3, 1);
    const adet = 9;
    const zamanlar = tikZamanlari(adet, m.roll);
    zamanlar.forEach((an, i) => {
      expect(egri(an / m.roll)).toBeCloseTo((i + 1) / adet, 2);
    });
  });

  it("schedules nothing for a zero-tick platform", () => {
    expect(tikZamanlari(0)).toEqual([]);
  });
});

describe("the pickup-window guards (§4.5)", () => {
  const basla = Date.parse("2026-08-19T15:30:00.000Z");
  const bitir = Date.parse("2026-08-19T18:00:00.000Z");

  it("names the three states the shutter can be in", () => {
    expect(pencereDurumu(basla - 1, basla, bitir)).toBe("acilmadi");
    expect(pencereDurumu(basla, basla, bitir)).toBe("acik");
    expect(pencereDurumu(bitir, basla, bitir)).toBe("acik");
    expect(pencereDurumu(bitir + 1, basla, bitir)).toBe("kapandi");
  });

  it("lets the shutter be lifted only inside the window", () => {
    expect(kaldirilabilir("acik")).toBe(true);
    expect(kaldirilabilir("acilmadi")).toBe(false);
    expect(kaldirilabilir("kapandi")).toBe(false);
  });

  it("warns under ten minutes, and not a minute earlier", () => {
    expect(UYARI_DK).toBe(10);
    expect(kepenkIniyorMu(bitir - 11 * 60_000, bitir)).toBe(false);
    expect(kepenkIniyorMu(bitir - 9 * 60_000, bitir)).toBe(true);
    expect(kapanmayaDk(bitir - 9 * 60_000, bitir)).toBe(9);
    // Past the end there is nothing left to warn about.
    expect(kepenkIniyorMu(bitir + 60_000, bitir)).toBe(false);
    expect(kapanmayaDk(bitir + 60_000, bitir)).toBe(0);
  });

  it("puts the ▲ where 'now' actually is, clamped at both ends", () => {
    expect(pencereOrani(basla - 60_000, basla, bitir)).toBe(0);
    expect(pencereOrani(basla, basla, bitir)).toBe(0);
    expect(pencereOrani((basla + bitir) / 2, basla, bitir)).toBeCloseTo(0.5, 5);
    expect(pencereOrani(bitir + 60_000, basla, bitir)).toBe(1);
    // A zero-length window is a data accident, not a division by zero.
    expect(pencereOrani(basla, basla, basla)).toBe(1);
  });
});

describe("the code (§4.5)", () => {
  it("sets the four informative characters large and keeps the prefix on the full string", () => {
    const parcalar = kodParcalari("K-7F3M");
    expect(parcalar.onEk).toBe(KOD_ON_EKI);
    expect(parcalar.haneler).toEqual(["7", "F", "3", "M"]);
    expect(parcalar.tam).toBe("K-7F3M");
  });

  it("never invents a prefix that is not there", () => {
    expect(kodParcalari("AB12CD").onEk).toBe("");
    expect(kodParcalari("AB12CD").haneler).toEqual(["A", "B", "1", "2", "C", "D"]);
  });

  it("spells the code out character by character for a screen reader", () => {
    expect(kodHeceleme("K-7F3M")).toBe("K, 7, F, 3, M");
  });
});

describe("the open state is never one-shot (§4.5 / §5.11)", () => {
  it("holds for thirty seconds and helps after two failed drags", () => {
    expect(ACIK_KALMA_SN).toBe(30);
    expect(YARDIM_ESIGI).toBe(2);
  });
});

describe("Turkish locative for a place name (§4.5's impact line)", () => {
  it("agrees with the last vowel and hardens after a voiceless consonant", () => {
    expect(yerBulunma("Kadıköy")).toBe("Kadıköy'de");
    expect(yerBulunma("Beşiktaş")).toBe("Beşiktaş'ta");
    expect(yerBulunma("Üsküdar")).toBe("Üsküdar'da");
    expect(yerBulunma("Şişli")).toBe("Şişli'de");
    expect(yerBulunma("Bakırköy")).toBe("Bakırköy'de");
    expect(yerBulunma("Sarıyer")).toBe("Sarıyer'de");
    expect(yerBulunma("Maltepe")).toBe("Maltepe'de");
    expect(yerBulunma("Ataşehir")).toBe("Ataşehir'de");
    expect(yerBulunma("Kartal")).toBe("Kartal'da");
    expect(yerBulunma("Ankara")).toBe("Ankara'da");
  });

  it("does not fall into `.toLowerCase()`'s Turkish I trap", () => {
    // 'I' lowercases to 'ı' (back) in Turkish and to 'i' (front) in every
    // other locale, which flips the suffix.
    expect(yerEki("KADIKÖY")).toBe("'de");
    expect(yerEki("SARIYER")).toBe("'de");
    expect(yerEki("KARTAL")).toBe("'da");
  });

  it("falls back to the back vowel when a name carries no vowel at all", () => {
    // The consonant rule still applies on top of the fallback.
    expect(yerEki("BJK")).toBe("'ta");
    expect(yerEki("BRN")).toBe("'da");
  });

  // "Zeytinburnu" is burun + u: already a possessive, so it takes a
  // buffer n. That is a fact about the word, not its spelling, and is
  // listed rather than derived.
  it("gives the possessive-construction districts their buffer n", () => {
    expect(yerBulunma("Zeytinburnu")).toBe("Zeytinburnu'nda");
    expect(yerBulunma("Beylikdüzü")).toBe("Beylikdüzü'nde");
    expect(yerBulunma("BEYLİKDÜZÜ")).toBe("BEYLİKDÜZÜ'nde");
  });
});
