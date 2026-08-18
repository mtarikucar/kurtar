import {
  formatClockTime,
  formatClockWithSeconds,
  formatDistance,
  formatKg,
  formatPriceCents,
  formatRemaining,
  formatShortDate,
  formatValueBand,
} from "../lib/format";

describe("format.ts — impact/money/distance number formatting", () => {
  it("formats kuruş as Turkish lira with 2 decimals (shared @kurtar/ui-tokens formatter — see that package's money.ts)", () => {
    expect(formatPriceCents(4990)).toBe("₺49,90");
    expect(formatPriceCents(0)).toBe("₺0,00");
    expect(formatPriceCents(100000)).toBe("₺1.000,00");
  });

  it("formats a value band as a range, collapsing equal min/max, prefixed like formatPriceCents", () => {
    expect(formatValueBand(15000, 20000)).toBe("₺150–200");
    expect(formatValueBand(10000, 10000)).toBe("~₺100");
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

  // [M5 fix] formatCountdown (mm:ss, no hour rollover) is gone — a pickup
  // hours away used to render e.g. "420:00" next to its own "18:30".
  it("formats sub-hour remaining time in minutes only", () => {
    expect(formatRemaining(65_000)).toBe("1 dk");
    expect(formatRemaining(3_000)).toBe("0 dk");
    expect(formatRemaining(59 * 60_000)).toBe("59 dk");
  });

  it("formats sub-day remaining time as hours + minutes, dropping a redundant ' 0 dk' tail", () => {
    expect(formatRemaining(60 * 60_000)).toBe("1 sa");
    expect(formatRemaining(90 * 60_000)).toBe("1 sa 30 dk");
    expect(formatRemaining(7 * 60 * 60_000)).toBe("7 sa");
    expect(formatRemaining(23 * 60 * 60_000 + 59 * 60_000)).toBe("23 sa 59 dk");
  });

  it("formats multi-day remaining time as days + hours, dropping a redundant ' 0 sa' tail", () => {
    expect(formatRemaining(24 * 60 * 60_000)).toBe("1 gün");
    expect(formatRemaining(25 * 60 * 60_000 + 12 * 60_000)).toBe("1 gün 1 sa");
    expect(formatRemaining(3 * 24 * 60 * 60_000)).toBe("3 gün");
  });

  it("floors a negative/zero duration at 0 dk, never a negative number", () => {
    expect(formatRemaining(-5_000)).toBe("0 dk");
    expect(formatRemaining(0)).toBe("0 dk");
  });
});

// [M9 fix] All three consumer-facing time formatters must pin
// `timeZone: "Europe/Istanbul"` on every `toLocale*` call — the `tr-TR`
// *locale* alone does not fix a zone (it only governs script/digit/
// calendar conventions), so before this fix every one of these silently
// rendered in whatever timezone the runtime (device, or the test process)
// happened to default to. Asserted by spying on the underlying
// `Date.prototype.toLocale{Time,Date}String` and inspecting the actual
// options object passed — deterministic regardless of what timezone data
// this particular runtime has installed or how it resolves `process.env.TZ`
// (a real device is never Europe/Istanbul by construction; that's the
// exact bug this guards against).
describe("format.ts — Istanbul-pinned regardless of the runtime's local timezone (M9)", () => {
  it("formatClockTime passes timeZone: Europe/Istanbul to toLocaleTimeString", () => {
    const spy = jest.spyOn(Date.prototype, "toLocaleTimeString");
    formatClockTime("2026-08-15T21:30:00.000Z");
    expect(spy).toHaveBeenCalledWith(
      "tr-TR",
      expect.objectContaining({ timeZone: "Europe/Istanbul" }),
    );
    spy.mockRestore();
  });

  it("formatClockWithSeconds passes timeZone: Europe/Istanbul to toLocaleTimeString", () => {
    const spy = jest.spyOn(Date.prototype, "toLocaleTimeString");
    formatClockWithSeconds(new Date("2026-08-15T21:30:00.000Z"));
    expect(spy).toHaveBeenCalledWith(
      "tr-TR",
      expect.objectContaining({ timeZone: "Europe/Istanbul" }),
    );
    spy.mockRestore();
  });

  it("formatShortDate passes timeZone: Europe/Istanbul to toLocaleDateString", () => {
    const spy = jest.spyOn(Date.prototype, "toLocaleDateString");
    formatShortDate("2026-08-15T21:30:00.000Z");
    expect(spy).toHaveBeenCalledWith(
      "tr-TR",
      expect.objectContaining({ timeZone: "Europe/Istanbul" }),
    );
    spy.mockRestore();
  });
});
