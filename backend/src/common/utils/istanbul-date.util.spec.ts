import {
  istanbulDateKey,
  istanbulHourOfDay,
  offerDateToDbDate,
} from "./istanbul-date.util";

describe("istanbulDateKey", () => {
  it("returns the Europe/Istanbul calendar date (UTC+3)", () => {
    // 21:30 UTC on the 13th is 00:30 Istanbul on the 14th.
    expect(istanbulDateKey(new Date("2026-08-13T21:30:00.000Z"))).toBe(
      "2026-08-14",
    );
    // 20:00 UTC on the 13th is still 23:00 Istanbul on the 13th.
    expect(istanbulDateKey(new Date("2026-08-13T20:00:00.000Z"))).toBe(
      "2026-08-13",
    );
  });
});

describe("offerDateToDbDate", () => {
  it("produces a fixed UTC-midnight instant for the calendar day", () => {
    expect(offerDateToDbDate("2026-08-13").toISOString()).toBe(
      "2026-08-13T00:00:00.000Z",
    );
  });
});

describe("istanbulHourOfDay", () => {
  it("converts UTC to the Europe/Istanbul (UTC+3) hour-of-day", () => {
    // 21:30 UTC -> 00:30 Istanbul -> hour 0
    expect(istanbulHourOfDay(new Date("2026-08-13T21:30:00.000Z"))).toBe(0);
    // 20:00 UTC -> 23:00 Istanbul -> hour 23
    expect(istanbulHourOfDay(new Date("2026-08-13T20:00:00.000Z"))).toBe(23);
    // 09:00 UTC -> 12:00 Istanbul -> hour 12
    expect(istanbulHourOfDay(new Date("2026-08-13T09:00:00.000Z"))).toBe(12);
  });

  it("returns an integer in [0,23] across a full day sweep", () => {
    for (let h = 0; h < 24; h++) {
      const hour = istanbulHourOfDay(new Date(Date.UTC(2026, 0, 1, h, 0, 0)));
      expect(Number.isInteger(hour)).toBe(true);
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);
    }
  });
});
