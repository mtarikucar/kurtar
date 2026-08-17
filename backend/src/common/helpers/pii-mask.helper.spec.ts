import { maskEmail, maskPhone, redactPushTokens } from "./pii-mask.helper";

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

describe("maskEmail", () => {
  it("masks a multi-char local part, keeping the first character and the full domain", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j***@example.com");
  });

  it("masks a single-char local part to a bare '*'", () => {
    expect(maskEmail("a@example.com")).toBe("*@example.com");
  });

  it("fully masks a value with no '@' at all", () => {
    expect(maskEmail("not-an-email")).toBe("***");
  });

  it("fully masks a value starting with '@' (empty local part)", () => {
    expect(maskEmail("@example.com")).toBe("***");
  });

  it("returns an empty string for empty/null/undefined input", () => {
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
    expect(maskEmail(undefined)).toBe("");
  });

  it("never contains the full local part in its output", () => {
    const full = "sensitive.owner@merchant.example.com";
    expect(maskEmail(full)).not.toBe(full);
    expect(maskEmail(full).includes("sensitive.owner")).toBe(false);
  });
});

describe("redactPushTokens", () => {
  it("redacts an ExponentPushToken[...] embedded in arbitrary text", () => {
    expect(
      redactPushTokens(
        '"ExponentPushToken[abc123XYZ]" is not a registered push notification recipient',
      ),
    ).toBe(
      '"ExponentPushToken[***]" is not a registered push notification recipient',
    );
  });

  it("redacts an ExpoPushToken[...] variant too", () => {
    expect(redactPushTokens("token ExpoPushToken[def456] invalid")).toBe(
      "token ExpoPushToken[***] invalid",
    );
  });

  it("redacts multiple occurrences in the same text", () => {
    const text =
      "batch: ExponentPushToken[deviceAAA], ExponentPushToken[deviceBBB] both failed";
    const redacted = redactPushTokens(text);
    expect(redacted).toBe(
      "batch: ExponentPushToken[***], ExponentPushToken[***] both failed",
    );
    expect(redacted).not.toContain("deviceAAA");
    expect(redacted).not.toContain("deviceBBB");
  });

  it("leaves text with no token untouched", () => {
    expect(redactPushTokens("HTTP 500 Internal Server Error")).toBe(
      "HTTP 500 Internal Server Error",
    );
  });

  it("never contains the raw token value in its output", () => {
    const full = "ExponentPushToken[super-secret-device-id-123]";
    const redacted = redactPushTokens(`error for ${full}`);
    expect(redacted).not.toContain("super-secret-device-id-123");
  });
});
