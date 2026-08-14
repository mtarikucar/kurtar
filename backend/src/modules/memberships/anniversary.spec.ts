import { addAnniversaryYears } from "./anniversary";

describe("addAnniversaryYears", () => {
  it("advances a plain (non-Feb-29) date by N years, same month/day", () => {
    const result = addAnniversaryYears(new Date("2026-08-14T10:00:00.000Z"), 1);
    expect(result.toISOString()).toBe("2027-08-14T00:00:00.000Z");
  });

  it("handles an Istanbul-late-night UTC instant landing on the next calendar day", () => {
    // 22:00 UTC on 2026-08-13 is 01:00 Istanbul on 2026-08-14.
    const result = addAnniversaryYears(new Date("2026-08-13T22:00:00.000Z"), 1);
    expect(result.toISOString()).toBe("2027-08-14T00:00:00.000Z");
  });

  it("[Feb-29 policy] a leap-year anchor rolls to Feb 28 in the next (non-leap) year", () => {
    // 2028 is a leap year; 2029 is not.
    const result = addAnniversaryYears(new Date("2028-02-29T00:00:00.000Z"), 1);
    expect(result.toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });

  it("[Feb-29 policy] stays on Feb 28 for every non-leap year in the run, then returns to Feb 29 once it exists again", () => {
    const anchor = new Date("2028-02-29T00:00:00.000Z");
    expect(addAnniversaryYears(anchor, 1).toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
    expect(addAnniversaryYears(anchor, 2).toISOString()).toBe(
      "2030-02-28T00:00:00.000Z",
    );
    expect(addAnniversaryYears(anchor, 3).toISOString()).toBe(
      "2031-02-28T00:00:00.000Z",
    );
    // 2032 is a leap year again.
    expect(addAnniversaryYears(anchor, 4).toISOString()).toBe(
      "2032-02-29T00:00:00.000Z",
    );
  });

  it("a Feb-28 anchor (not itself Feb 29) is unaffected by the leap-year policy", () => {
    const result = addAnniversaryYears(new Date("2026-02-28T00:00:00.000Z"), 1);
    expect(result.toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });

  it("rejects a non-positive or non-integer yearsToAdd", () => {
    expect(() => addAnniversaryYears(new Date(), 0)).toThrow();
    expect(() => addAnniversaryYears(new Date(), -1)).toThrow();
    expect(() => addAnniversaryYears(new Date(), 1.5)).toThrow();
  });
});
