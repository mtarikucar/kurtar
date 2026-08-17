import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidIban,
  isValidPassword,
  isValidTaxId,
} from "./validators";

describe("isValidTaxId", () => {
  it("accepts a 10-digit VKN", () => {
    expect(isValidTaxId("1234567890")).toBe(true);
  });
  it("accepts an 11-digit TCKN", () => {
    expect(isValidTaxId("12345678901")).toBe(true);
  });
  it("rejects the wrong length or non-digit characters", () => {
    expect(isValidTaxId("123456789")).toBe(false);
    expect(isValidTaxId("123456789012")).toBe(false);
    expect(isValidTaxId("12345abcde")).toBe(false);
  });
});

describe("isValidIban", () => {
  it("accepts a real, checksum-valid Turkish IBAN", () => {
    // A well-known publicly-documented example IBAN, MOD97-10 valid.
    expect(isValidIban("TR330006100519786457841326")).toBe(true);
  });

  it("rejects a non-TR IBAN", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(false);
  });

  it("rejects a TR IBAN with the right shape but a broken checksum", () => {
    expect(isValidIban("TR330006100519786457841327")).toBe(false);
  });

  it("is tolerant of spaces and lowercase input", () => {
    expect(isValidIban("tr33 0006 1005 1978 6457 8413 26")).toBe(true);
  });
});

describe("isValidEmail / isValidPassword", () => {
  it("accepts a plausible email and rejects an obviously malformed one", () => {
    expect(isValidEmail("sahibi@firma.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("enforces the 8-char minimum password length", () => {
    expect(isValidPassword("short1")).toBe(false);
    expect(isValidPassword("longenough1")).toBe(true);
  });
});
