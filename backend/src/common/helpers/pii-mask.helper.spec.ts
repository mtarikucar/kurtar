import { maskPhone } from "./pii-mask.helper";

describe("maskPhone", () => {
  it("masks a TR E.164 number, keeping +90 and the last 2 digits", () => {
    expect(maskPhone("+905551112233")).toBe("+90****33");
  });

  it("masks a non-TR E.164 number, keeping the 1-digit country code", () => {
    expect(maskPhone("+15551112233")).toBe("+1****33");
  });

  it("masks a bare-digits number with no country code retained", () => {
    expect(maskPhone("5551112233")).toBe("***33");
  });

  it("fully masks a too-short value", () => {
    expect(maskPhone("abc")).toBe("***");
  });

  it("returns an empty string for empty/null/undefined input", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone(null)).toBe("");
    expect(maskPhone(undefined)).toBe("");
  });

  it("never contains the full original number in its output", () => {
    const full = "+905551234567";
    expect(maskPhone(full)).not.toBe(full);
    expect(maskPhone(full).includes("5551234")).toBe(false);
  });
});
