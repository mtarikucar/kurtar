import { isValidTaxId } from "./tax-id.util";

describe("isValidTaxId", () => {
  it.each([
    ["1234567890", "10-digit VKN"],
    ["0000000001", "10-digit VKN with leading zero"],
    ["12345678901", "11-digit TCKN"],
    ["10000000146", "11-digit TCKN"],
  ])("accepts %s (%s)", (value, _description) => {
    expect(isValidTaxId(value)).toBe(true);
  });

  it.each([
    ["123456789", "9 digits — one short of VKN"],
    ["123456789012", "12 digits — one over TCKN"],
    ["12345abcde", "contains letters"],
    ["", "empty string"],
    [null, "null"],
    [undefined, "undefined"],
    [" 1234567890", "leading whitespace"],
    ["1234567890 ", "trailing whitespace"],
  ])("rejects %s (%s)", (value, _description) => {
    expect(isValidTaxId(value as string | null | undefined)).toBe(false);
  });
});
