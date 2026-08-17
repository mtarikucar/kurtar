import { splitMembershipOffsetVat } from "./membership-offset.service";

describe("splitMembershipOffsetVat", () => {
  it("[reviewer's own example] a full offset of 6000 against a 5000+1000 balance recovers all 1000 VAT", () => {
    expect(splitMembershipOffsetVat(6000, 1000, 6000)).toBe(1000);
  });

  it("a partial offset is allocated proportionally to the remaining net:VAT ratio", () => {
    // 6000 due (5000 net + 1000 vat, a 5:1 ratio). Offsetting 3000 (half)
    // should recover half of each: 2500 net + 500 vat.
    expect(splitMembershipOffsetVat(6000, 1000, 3000)).toBe(500);
  });

  it("rounds the proportional allocation (single-sourced via roundKurus)", () => {
    // 6001 due (5001 net + 1000 vat — an irregular ratio). Offsetting 3000:
    // 3000 * 1000 / 6001 = 499.9166... -> 500.
    expect(splitMembershipOffsetVat(6001, 1000, 3000)).toBe(500);
  });

  it("returns 0 for a zero or negative offset", () => {
    expect(splitMembershipOffsetVat(6000, 1000, 0)).toBe(0);
  });

  it("returns 0 when there is no remaining balance to split", () => {
    expect(splitMembershipOffsetVat(0, 0, 0)).toBe(0);
  });

  it("never exceeds the remaining VAT even if a rounding edge would push it over", () => {
    // Contrived: applied slightly less than due, but proportional rounding
    // would want to hand back MORE vat than actually remains.
    expect(splitMembershipOffsetVat(100, 99, 99)).toBeLessThanOrEqual(99);
  });

  it("never exceeds the applied offset itself", () => {
    const result = splitMembershipOffsetVat(1000, 999, 1);
    expect(result).toBeLessThanOrEqual(1);
  });
});
