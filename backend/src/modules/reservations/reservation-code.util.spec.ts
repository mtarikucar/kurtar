import {
  RESERVATION_CODE_ALPHABET,
  RESERVATION_CODE_PREFIX,
  generateReservationCode,
} from "./reservation-code.util";

describe("generateReservationCode", () => {
  it("always starts with the K- prefix", () => {
    for (let i = 0; i < 50; i++) {
      expect(
        generateReservationCode().startsWith(RESERVATION_CODE_PREFIX),
      ).toBe(true);
    }
  });

  it("produces a 4-character suffix drawn only from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReservationCode();
      const suffix = code.slice(RESERVATION_CODE_PREFIX.length);
      expect(suffix).toHaveLength(4);
      for (const char of suffix) {
        expect(RESERVATION_CODE_ALPHABET.includes(char)).toBe(true);
      }
    }
  });

  it("the alphabet excludes 0, O, 1, and I", () => {
    expect(RESERVATION_CODE_ALPHABET).not.toEqual(expect.stringContaining("0"));
    expect(RESERVATION_CODE_ALPHABET).not.toEqual(expect.stringContaining("O"));
    expect(RESERVATION_CODE_ALPHABET).not.toEqual(expect.stringContaining("1"));
    expect(RESERVATION_CODE_ALPHABET).not.toEqual(expect.stringContaining("I"));
  });

  it("generates distinct codes across many calls (not a fixed/degenerate output)", () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => generateReservationCode()),
    );
    // 32^4 possible suffixes — 500 draws colliding down to a handful of
    // unique values would indicate a broken RNG, not bad luck.
    expect(codes.size).toBeGreaterThan(400);
  });
});
