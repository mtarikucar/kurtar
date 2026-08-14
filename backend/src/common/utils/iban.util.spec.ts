import {
  isValidIban,
  isValidIbanChecksum,
  isValidIbanFormat,
} from "./iban.util";

// TR33 0006 1005 1978 6457 8413 26 — a genuine ISO 7064 MOD97-10 checksum
// computed for this fixture (bank code 00061, account 0519786457841326),
// not just a format-shaped string. See the migration/report for how it was
// derived. Used across the offers/discovery realdb specs and the curl
// verification flow as well, so every merchant seeded in this task shares
// one real IBAN.
const VALID_IBAN = "TR330006100519786457841326";

describe("isValidIbanFormat", () => {
  it("accepts a well-formed Turkish IBAN", () => {
    expect(isValidIbanFormat(VALID_IBAN)).toBe(true);
  });

  it("accepts lowercase and strips whitespace", () => {
    expect(isValidIbanFormat("tr33 0006 1005 1978 6457 8413 26")).toBe(true);
  });

  it.each([
    ["DE89370400440532013000", "wrong country prefix"],
    ["TR3300061005197864578413", "too short"],
    ["TR330006100519786457841326X", "too long"],
    ["", "empty"],
    [null, "null"],
    [undefined, "undefined"],
  ])("rejects %s (%s)", (value, _description) => {
    expect(isValidIbanFormat(value as string | null | undefined)).toBe(false);
  });
});

describe("isValidIbanChecksum", () => {
  it("accepts the genuine checksum", () => {
    expect(isValidIbanChecksum(VALID_IBAN)).toBe(true);
  });

  it("rejects a single flipped check digit", () => {
    expect(isValidIbanChecksum("TR340006100519786457841326")).toBe(false);
  });

  it("rejects a single flipped BBAN digit", () => {
    expect(isValidIbanChecksum("TR330006100519786457841327")).toBe(false);
  });
});

describe("isValidIban", () => {
  it("requires both format and checksum", () => {
    expect(isValidIban(VALID_IBAN)).toBe(true);
    expect(isValidIban("TR340006100519786457841326")).toBe(false); // bad checksum, valid format
    expect(isValidIban("DE89370400440532013000")).toBe(false); // wrong format entirely
    expect(isValidIban(null)).toBe(false);
  });
});
