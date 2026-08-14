import { isWithinQuietHours } from "./quiet-hours.util";

// 09:00 UTC == 12:00 Istanbul; 20:00 UTC == 23:00 Istanbul; 21:30 UTC ==
// 00:30 Istanbul (next day) — matches istanbul-date.util.spec.ts's fixtures.
const NOON_ISTANBUL = new Date("2026-08-13T09:00:00.000Z");
const ELEVEN_PM_ISTANBUL = new Date("2026-08-13T20:00:00.000Z");
const HALF_PAST_MIDNIGHT_ISTANBUL = new Date("2026-08-13T21:30:00.000Z");

describe("isWithinQuietHours", () => {
  it("never quiet when either bound is null (not configured)", () => {
    expect(isWithinQuietHours(null, 8, NOON_ISTANBUL)).toBe(false);
    expect(isWithinQuietHours(22, null, NOON_ISTANBUL)).toBe(false);
    expect(isWithinQuietHours(null, null, NOON_ISTANBUL)).toBe(false);
  });

  it("never quiet when start === end (degenerate config, not '24h quiet')", () => {
    expect(isWithinQuietHours(9, 9, NOON_ISTANBUL)).toBe(false);
  });

  it("same-day window (start < end): inside vs outside", () => {
    // quiet 9-18 Istanbul
    expect(isWithinQuietHours(9, 18, NOON_ISTANBUL)).toBe(true); // 12:00
    expect(isWithinQuietHours(9, 18, ELEVEN_PM_ISTANBUL)).toBe(false); // 23:00
  });

  it("same-day window is a half-open interval: start boundary IN, end boundary OUT", () => {
    const nineAm = new Date("2026-08-13T06:00:00.000Z"); // 09:00 Istanbul
    const sixPm = new Date("2026-08-13T15:00:00.000Z"); // 18:00 Istanbul
    expect(isWithinQuietHours(9, 18, nineAm)).toBe(true);
    expect(isWithinQuietHours(9, 18, sixPm)).toBe(false);
  });

  it("wrapping window (start > end, e.g. 22 -> 8): inside vs outside", () => {
    // quiet 22:00 -> 08:00 Istanbul
    expect(isWithinQuietHours(22, 8, ELEVEN_PM_ISTANBUL)).toBe(true); // 23:00
    expect(isWithinQuietHours(22, 8, HALF_PAST_MIDNIGHT_ISTANBUL)).toBe(true); // 00:30
    expect(isWithinQuietHours(22, 8, NOON_ISTANBUL)).toBe(false); // 12:00
  });
});
