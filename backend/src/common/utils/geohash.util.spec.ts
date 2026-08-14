import { encodeGeohash } from "./geohash.util";

describe("encodeGeohash", () => {
  it("matches the canonical Wikipedia geohash vector", () => {
    // https://en.wikipedia.org/wiki/Geohash's own worked example.
    expect(encodeGeohash(42.6, -5.6, 5)).toBe("ezs42");
  });

  it("respects the requested precision", () => {
    expect(encodeGeohash(42.6, -5.6, 1)).toHaveLength(1);
    expect(encodeGeohash(42.6, -5.6, 8)).toHaveLength(8);
  });

  it("defaults to precision 5", () => {
    expect(encodeGeohash(42.6, -5.6)).toBe("ezs42");
  });

  it("buckets two nearby points (~550m apart) into the same cell", () => {
    // Kadıköy, Istanbul — same pair used by the Task 2 realdb PostGIS spec.
    const a = encodeGeohash(40.9909, 29.0304, 5);
    const b = encodeGeohash(40.9959, 29.0304, 5);
    expect(a).toBe(b);
  });

  it("does not bucket two distant points (different cities) together", () => {
    const istanbul = encodeGeohash(41.0082, 28.9784, 5);
    const ankara = encodeGeohash(39.9334, 32.8597, 5);
    expect(istanbul).not.toBe(ankara);
  });

  it("is deterministic", () => {
    expect(encodeGeohash(40.9909, 29.0304, 6)).toBe(
      encodeGeohash(40.9909, 29.0304, 6),
    );
  });
});
