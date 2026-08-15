import {
  formatCountdown,
  formatDistance,
  formatKg,
  formatPriceCents,
  formatValueBand,
} from "../lib/format";

describe("format.ts — impact/money/distance number formatting", () => {
  it("formats kuruş as Turkish lira with 2 decimals (shared @kurtar/ui-tokens formatter — see that package's money.ts)", () => {
    expect(formatPriceCents(4990)).toBe("₺49,90");
    expect(formatPriceCents(0)).toBe("₺0,00");
    expect(formatPriceCents(100000)).toBe("₺1.000,00");
  });

  it("formats a value band as a range, collapsing equal min/max", () => {
    expect(formatValueBand(15000, 20000)).toBe("150–200 ₺");
    expect(formatValueBand(10000, 10000)).toBe("~100 ₺");
  });

  it("formats distance in meters under 1km, kilometers at/above", () => {
    expect(formatDistance(350)).toBe("350 m");
    expect(formatDistance(999)).toBe("999 m");
    expect(formatDistance(1000)).toBe("1 km");
    expect(formatDistance(2350)).toBe("2,4 km");
  });

  it("formats grams as kg with one decimal — impact CO2e stat", () => {
    expect(formatKg(2500)).toBe("2,5");
    expect(formatKg(1000)).toBe("1");
    expect(formatKg(0)).toBe("0");
  });

  it("formats a countdown duration as mm:ss, floored at zero", () => {
    expect(formatCountdown(65_000)).toBe("01:05");
    expect(formatCountdown(3_000)).toBe("00:03");
    expect(formatCountdown(-5_000)).toBe("00:00");
    expect(formatCountdown(0)).toBe("00:00");
  });
});
