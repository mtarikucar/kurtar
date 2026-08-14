import { istanbulDateKey, offerDateToDbDate } from "./istanbul-date.util";

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
