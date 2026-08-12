import {
  calculateDistance,
  isLocationWithinRange,
  isValidCoordinates,
} from "./geolocation.util";

describe("calculateDistance", () => {
  it("returns 0 for the same point", () => {
    expect(calculateDistance(40.9909, 29.0304, 40.9909, 29.0304)).toBe(0);
  });

  it("returns a plausible distance (~550m) for two nearby Kadıköy points", () => {
    // Same pair used in the Task 2 PostGIS realdb smoke spec.
    const distance = calculateDistance(40.9909, 29.0304, 40.9959, 29.0304);
    expect(distance).toBeGreaterThan(500);
    expect(distance).toBeLessThan(600);
  });

  it("is symmetric", () => {
    const a = calculateDistance(40.9909, 29.0304, 41.0, 29.05);
    const b = calculateDistance(41.0, 29.05, 40.9909, 29.0304);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("isLocationWithinRange", () => {
  it("reports within-range for a nearby point under the radius", () => {
    const result = isLocationWithinRange(
      40.9959,
      29.0304,
      40.9909,
      29.0304,
      1000,
    );
    expect(result.isWithinRange).toBe(true);
    expect(result.distance).toBeGreaterThan(0);
  });

  it("reports out-of-range for a point beyond the radius", () => {
    const result = isLocationWithinRange(41.5, 29.5, 40.9909, 29.0304, 1000);
    expect(result.isWithinRange).toBe(false);
  });
});

describe("isValidCoordinates", () => {
  it.each([
    [0, 0, true],
    [90, 180, true],
    [-90, -180, true],
    [90.0001, 0, false],
    [0, 180.0001, false],
    [-90.0001, 0, false],
  ])("lat=%p lon=%p -> valid=%p", (lat, lon, expected) => {
    expect(isValidCoordinates(lat, lon)).toBe(expected);
  });

  it("rejects null/undefined latitude or longitude", () => {
    expect(isValidCoordinates(null, 10)).toBe(false);
    expect(isValidCoordinates(10, undefined)).toBe(false);
    expect(isValidCoordinates(undefined, undefined)).toBe(false);
  });
});
