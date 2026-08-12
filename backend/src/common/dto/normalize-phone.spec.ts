import { plainToInstance } from "class-transformer";
import { NormalizePhone, normalizePhoneToE164 } from "./normalize-phone";

describe("normalizePhoneToE164", () => {
  it("normalizes a Turkish national-format number (leading 0) to E.164", () => {
    expect(normalizePhoneToE164("0555 123 45 67")).toBe("+905551234567");
  });

  it("normalizes a number already carrying +90 with punctuation", () => {
    expect(normalizePhoneToE164("+90 555 123 45 67")).toBe("+905551234567");
  });

  it("normalizes bare national digits under the default TR region", () => {
    expect(normalizePhoneToE164("5551234567")).toBe("+905551234567");
  });

  it("returns unparseable input trimmed but otherwise unchanged", () => {
    expect(normalizePhoneToE164("not-a-phone")).toBe("not-a-phone");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizePhoneToE164("   ")).toBe("");
  });

  it("respects an explicit non-default region", () => {
    // US number, no country code typed, region forced to US.
    expect(normalizePhoneToE164("(415) 555-2671", "US")).toBe("+14155552671");
  });
});

describe("NormalizePhone decorator", () => {
  class Dto {
    @NormalizePhone("TR")
    phone!: string;
  }

  it("transforms a plain string field to canonical E.164", () => {
    const instance = plainToInstance(Dto, { phone: "0555 123 45 67" });
    expect(instance.phone).toBe("+905551234567");
  });

  it("collapses an empty string to undefined instead of ''", () => {
    const instance = plainToInstance(Dto, { phone: "   " });
    expect(instance.phone).toBeUndefined();
  });

  it("leaves non-string values untouched (validators reject the shape)", () => {
    const instance = plainToInstance(Dto, { phone: 12345 as unknown });
    expect(instance.phone).toBe(12345);
  });
});
