import {
  faz,
  fazHesapla,
  gunBatimi,
  gunesOlaylari,
  VARSAYILAN_KONUM,
} from "../design/faz";

/**
 * The phase function is pure, which is the whole point: day/night QA is
 * six unit tests at fixed timestamps plus six screenshots, not a
 * time-travel exercise (spec §6, Phase 3).
 */

const KADIKOY = VARSAYILAN_KONUM;
/** A round sunset to measure the thresholds against: 19:00 Istanbul. */
const BATIS = new Date("2026-08-19T16:00:00.000Z");

const dk = (n: number) => new Date(BATIS.getTime() + n * 60_000);

describe("faz() — three discrete phases (§1.1)", () => {
  it.each([
    ["four hours before sunset", -240, "gunduz"],
    ["46 minutes before sunset", -46, "gunduz"],
    ["exactly 45 minutes before sunset — twilight opens", -45, "alacakaranlik"],
    ["one minute before sunset", -1, "alacakaranlik"],
    ["sunset itself", 0, "alacakaranlik"],
    ["24 minutes after sunset", 24, "alacakaranlik"],
    ["25 minutes after sunset — night starts", 25, "gece"],
    ["three hours after sunset", 180, "gece"],
  ])("%s -> %s", (_ad, offsetDk, beklenen) => {
    expect(faz(dk(offsetDk), BATIS)).toBe(beklenen);
  });

  it("never interpolates: only ever returns one of the three phases", () => {
    const gorulen = new Set<string>();
    for (let offset = -600; offset <= 600; offset += 1) {
      gorulen.add(faz(dk(offset), BATIS));
    }
    expect([...gorulen].sort()).toEqual(["alacakaranlik", "gece", "gunduz"]);
  });
});

describe("gunesOlaylari() — local solar position, no network (§1.1)", () => {
  /** Published times, all within a minute of this equation. */
  it.each([
    ["İstanbul, 21 Haziran 2026", "2026-06-21", 41.0082, 28.9784, "2026-06-21T17:40:00Z"],
    ["İstanbul, 21 Aralık 2026", "2026-12-21", 41.0082, 28.9784, "2026-12-21T14:39:00Z"],
    ["Londra, 21 Haziran 2026", "2026-06-21", 51.5074, -0.1278, "2026-06-21T20:22:00Z"],
    ["Londra, 21 Aralık 2026", "2026-12-21", 51.5074, -0.1278, "2026-12-21T15:54:00Z"],
    ["New York, 21 Haziran 2026", "2026-06-21", 40.7128, -74.006, "2026-06-22T00:31:00Z"],
  ])("%s", (_ad, gun, enlem, boylam, beklenen) => {
    const hesaplanan = gunBatimi(new Date(`${gun}T12:00:00Z`), enlem, boylam);
    const farkDk = Math.abs(hesaplanan.getTime() - new Date(beklenen).getTime()) / 60_000;
    expect(farkDk).toBeLessThan(3);
  });

  it("sunrise precedes solar noon precedes sunset", () => {
    const { dogus, gecis, batis } = gunesOlaylari(
      new Date("2026-08-19T12:00:00Z"),
      KADIKOY.enlem,
      KADIKOY.boylam,
    );
    expect(dogus.getTime()).toBeLessThan(gecis.getTime());
    expect(gecis.getTime()).toBeLessThan(batis.getTime());
  });

  it("degrades instead of returning NaN inside the polar circle", () => {
    const yaz = gunesOlaylari(new Date("2026-06-21T12:00:00Z"), 78.22, 15.65); // Svalbard
    const kis = gunesOlaylari(new Date("2026-12-21T12:00:00Z"), 78.22, 15.65);
    expect(Number.isNaN(yaz.batis.getTime())).toBe(false);
    expect(Number.isNaN(kis.batis.getTime())).toBe(false);
    // Midnight sun: the phase stays day. Polar night: it stays night.
    expect(faz(yaz.gecis, yaz.batis)).toBe("gunduz");
    expect(fazHesapla(new Date(kis.gecis.getTime() + 60_000), kis)).toBe("gece");
  });
});

describe("fazHesapla() — the pre-dawn hole faz() alone leaves open", () => {
  const olaylar = gunesOlaylari(
    new Date("2026-12-21T12:00:00Z"),
    KADIKOY.enlem,
    KADIKOY.boylam,
  );

  it("is still night at 04:00, hours before that day's sunset", () => {
    const sabahaKarsi = new Date("2026-12-21T01:00:00.000Z"); // 04:00 İstanbul
    // The bare spec function would call this daylight, because 04:00 is
    // ~13 hours BEFORE sunset.
    expect(faz(sabahaKarsi, olaylar.batis)).toBe("gunduz");
    expect(fazHesapla(sabahaKarsi, olaylar)).toBe("gece");
  });

  it("hands back to the spec's rule once the sun is up", () => {
    const ogle = new Date(olaylar.gecis.getTime());
    expect(fazHesapla(ogle, olaylar)).toBe("gunduz");
    expect(fazHesapla(new Date(olaylar.batis.getTime() + 30 * 60_000), olaylar)).toBe("gece");
    expect(fazHesapla(new Date(olaylar.batis.getTime() - 30 * 60_000), olaylar)).toBe(
      "alacakaranlik",
    );
  });
});
