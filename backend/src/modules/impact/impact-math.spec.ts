import {
  computeCo2eGrams,
  computeImpactLine,
  computeMealsSaved,
  computeMoneySavedCents,
} from "./impact-math";

describe("computeMealsSaved", () => {
  it("is a straight qty passthrough", () => {
    expect(computeMealsSaved(1)).toBe(1);
    expect(computeMealsSaved(4)).toBe(4);
  });
});

describe("computeCo2eGrams", () => {
  it("multiplies qty by the per-bag constant", () => {
    expect(computeCo2eGrams(1, 2500)).toBe(2500);
    expect(computeCo2eGrams(3, 2500)).toBe(7500);
  });
});

describe("computeMoneySavedCents", () => {
  it("computes (min+max)/2 * qty - totalCents for the happy path", () => {
    // midpoint = (10000+20000)/2 = 15000, qty=1, totalCents=5000 -> 10000
    expect(computeMoneySavedCents(1, 5000, 10000, 20000)).toBe(10000);
  });

  it("scales the midpoint by qty", () => {
    // midpoint 15000 * qty 2 = 30000, totalCents 9000 -> 21000
    expect(computeMoneySavedCents(2, 9000, 10000, 20000)).toBe(21000);
  });

  it("floors an odd midpoint sum instead of rounding up", () => {
    // (10000+10001)/2 = 10000.5 -> floor to 10000, qty 1, total 0 -> 10000
    expect(computeMoneySavedCents(1, 0, 10000, 10001)).toBe(10000);
  });

  it("floors at 0 when totalCents exceeds the estimated original value — never a negative saving", () => {
    // midpoint 15000, totalCents 20000 -> would be -5000, floored to 0
    expect(computeMoneySavedCents(1, 20000, 10000, 20000)).toBe(0);
  });

  it("floors at 0 exactly at the boundary (midpoint == totalCents)", () => {
    expect(computeMoneySavedCents(1, 15000, 10000, 20000)).toBe(0);
  });
});

describe("computeImpactLine", () => {
  it("combines all three figures from one input", () => {
    const line = computeImpactLine({
      qty: 2,
      co2ePerBagGrams: 2500,
      totalCents: 9000,
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
    });
    expect(line).toEqual({
      mealsSaved: 2,
      co2eGrams: 5000,
      moneySavedCents: 21000,
    });
  });

  it("floor-at-0 also holds through the combined entry point", () => {
    const line = computeImpactLine({
      qty: 1,
      co2ePerBagGrams: 2500,
      totalCents: 999999,
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
    });
    expect(line.moneySavedCents).toBe(0);
  });
});
