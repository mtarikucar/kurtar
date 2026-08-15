import { describe, expect, it } from "vitest";
import {
  BAG_PRICE_FLOOR_CENTS,
  parseTryToCents,
  validateBagPricing,
} from "./money";

describe("BAG_PRICE_FLOOR_CENTS", () => {
  it("matches the backend's ₺59.00 floor (offer.constants.ts)", () => {
    expect(BAG_PRICE_FLOOR_CENTS).toBe(5900);
  });
});

describe("parseTryToCents", () => {
  it("parses a plain integer TL string", () => {
    expect(parseTryToCents("65")).toBe(6500);
  });

  it("parses two-decimal TL strings with a dot or a comma", () => {
    expect(parseTryToCents("64.90")).toBe(6490);
    expect(parseTryToCents("64,90")).toBe(6490);
  });

  it("rejects empty input, letters, and negative numbers", () => {
    expect(parseTryToCents("")).toBeNull();
    expect(parseTryToCents("abc")).toBeNull();
    expect(parseTryToCents("-5")).toBeNull();
  });
});

describe("validateBagPricing — price-floor validation", () => {
  it("flags a price below the ₺59 platform floor", () => {
    const errors = validateBagPricing({
      priceCents: 5000,
      originalValueCentsMin: 15000,
      originalValueCentsMax: 20000,
    });
    expect(errors.priceBelowFloor).toBe(true);
  });

  it("passes a price exactly at the floor (BAG_PRICE_FLOOR_CENTS is inclusive on the backend: `< floor` fails, `=== floor` passes)", () => {
    const errors = validateBagPricing({
      priceCents: BAG_PRICE_FLOOR_CENTS,
      originalValueCentsMin: 15000,
      originalValueCentsMax: 20000,
    });
    expect(errors.priceBelowFloor).toBeUndefined();
  });

  it("flags a price that is not below the bag's own declared value (a surprise bag must be a discount)", () => {
    const errors = validateBagPricing({
      priceCents: 6500,
      originalValueCentsMin: 6000,
      originalValueCentsMax: 9000,
    });
    expect(errors.priceNotBelowValue).toBe(true);
  });

  it("flags an inverted value band (min > max)", () => {
    const errors = validateBagPricing({
      priceCents: 6500,
      originalValueCentsMin: 12000,
      originalValueCentsMax: 9000,
    });
    expect(errors.valueBandInvalid).toBe(true);
  });

  it("passes a fully valid pricing combination with no errors", () => {
    const errors = validateBagPricing({
      priceCents: 6500,
      originalValueCentsMin: 15000,
      originalValueCentsMax: 25000,
    });
    expect(errors).toEqual({});
  });
});
