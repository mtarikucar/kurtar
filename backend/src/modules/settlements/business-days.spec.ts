import { addBusinessDays, isBusinessDay } from "./business-days";

const NO_HOLIDAYS: ReadonlySet<string> = new Set();

describe("isBusinessDay", () => {
  it("treats Mon-Fri as business days with no holidays", () => {
    // 2026-08-10 is a Monday, 2026-08-14 is a Friday (verified against
    // istanbul-date.util.spec.ts's fixture week).
    expect(isBusinessDay("2026-08-10", NO_HOLIDAYS)).toBe(true);
    expect(isBusinessDay("2026-08-11", NO_HOLIDAYS)).toBe(true);
    expect(isBusinessDay("2026-08-12", NO_HOLIDAYS)).toBe(true);
    expect(isBusinessDay("2026-08-13", NO_HOLIDAYS)).toBe(true);
    expect(isBusinessDay("2026-08-14", NO_HOLIDAYS)).toBe(true);
  });

  it("treats Saturday/Sunday as non-business days", () => {
    expect(isBusinessDay("2026-08-15", NO_HOLIDAYS)).toBe(false); // Sat
    expect(isBusinessDay("2026-08-16", NO_HOLIDAYS)).toBe(false); // Sun
  });

  it("treats a seeded holiday on a weekday as a non-business day", () => {
    const holidays = new Set(["2026-08-30"]); // Zafer Bayramı, a Sunday in 2026 — use a weekday instead
    // 2026-10-29 (Cumhuriyet Bayramı) is a Thursday in 2026.
    const weekdayHoliday = new Set(["2026-10-29"]);
    expect(isBusinessDay("2026-10-29", weekdayHoliday)).toBe(false);
    // Sanity: the same date with no holiday set IS a business day.
    expect(isBusinessDay("2026-10-29", NO_HOLIDAYS)).toBe(true);
    void holidays;
  });

  it("edge case: a holiday that ALSO falls on a weekend is still simply not a business day (no double-counting relevance here)", () => {
    // 2026-08-30 (Zafer Bayramı) is a Sunday in 2026.
    const holidays = new Set(["2026-08-30"]);
    expect(isBusinessDay("2026-08-30", holidays)).toBe(false);
    expect(isBusinessDay("2026-08-30", NO_HOLIDAYS)).toBe(false); // weekend alone already makes it false
  });
});

describe("addBusinessDays", () => {
  it("adds N business days across a plain weekday span with no weekend/holiday in between", () => {
    // Monday 2026-08-10 + 3 business days = Thursday 2026-08-13.
    const result = addBusinessDays(
      new Date("2026-08-10T09:00:00.000Z"),
      3,
      NO_HOLIDAYS,
    );
    expect(result.toISOString()).toBe("2026-08-13T00:00:00.000Z");
  });

  it("skips a weekend that falls inside the span", () => {
    // Friday 2026-08-14 + 1 business day skips Sat/Sun -> Monday 2026-08-17.
    const result = addBusinessDays(
      new Date("2026-08-14T09:00:00.000Z"),
      1,
      NO_HOLIDAYS,
    );
    expect(result.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });

  it("[brief example] Monday + 5 business days = the FOLLOWING Monday (Tue,Wed,Thu,Fri,Mon)", () => {
    const result = addBusinessDays(
      new Date("2026-08-10T00:00:00.000Z"), // Monday
      5,
      NO_HOLIDAYS,
    );
    expect(result.toISOString()).toBe("2026-08-17T00:00:00.000Z"); // next Monday
  });

  it("skips a weekday holiday inside the span, on top of weekends", () => {
    // Wednesday 2026-10-28 + 2 business days would normally land on Friday
    // 2026-10-30, but 2026-10-29 (Cumhuriyet Bayramı, a Thursday) is a
    // holiday -> Thu is skipped -> Fri 30th is business day 1, the
    // following Monday (Nov 2) is business day 2.
    const holidays = new Set(["2026-10-29"]);
    const result = addBusinessDays(
      new Date("2026-10-28T00:00:00.000Z"), // Wednesday
      2,
      holidays,
    );
    expect(result.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("a holiday landing on what would already be a weekend consumes no extra step", () => {
    // Zafer Bayramı 2026-08-30 is a Sunday — already skipped by the
    // weekend rule, so its presence in `holidays` must not shift the
    // result by an extra day versus NO_HOLIDAYS.
    const holidays = new Set(["2026-08-30"]);
    const withHoliday = addBusinessDays(
      new Date("2026-08-27T00:00:00.000Z"), // Thursday
      2,
      holidays,
    );
    const without = addBusinessDays(
      new Date("2026-08-27T00:00:00.000Z"),
      2,
      NO_HOLIDAYS,
    );
    expect(withHoliday.toISOString()).toBe(without.toISOString());
  });

  it("n=0 returns the start date's own calendar day unchanged", () => {
    const result = addBusinessDays(
      new Date("2026-08-15T14:00:00.000Z"), // Saturday, not itself a business day
      0,
      NO_HOLIDAYS,
    );
    expect(result.toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  it("rejects a negative or non-integer n", () => {
    expect(() => addBusinessDays(new Date(), -1, NO_HOLIDAYS)).toThrow();
    expect(() => addBusinessDays(new Date(), 1.5, NO_HOLIDAYS)).toThrow();
  });

  it("normalizes an Istanbul-late-night UTC instant onto the correct starting calendar day before counting", () => {
    // 22:00 UTC on Sunday 2026-08-16 is 01:00 Istanbul on Monday 2026-08-17
    // — the count must start from Monday, so +1 business day lands on
    // Tuesday 2026-08-18, not Monday.
    const result = addBusinessDays(
      new Date("2026-08-16T22:00:00.000Z"),
      1,
      NO_HOLIDAYS,
    );
    expect(result.toISOString()).toBe("2026-08-18T00:00:00.000Z");
  });
});
