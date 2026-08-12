import { BadRequestException } from "@nestjs/common";
import { validateBagTemplateEconomics } from "./bag-template.rules";
import { BAG_PRICE_FLOOR_CENTS } from "./offer.constants";

function base() {
  return {
    priceCents: 6000,
    originalValueCentsMin: 15000,
    originalValueCentsMax: 25000,
  };
}

describe("validateBagTemplateEconomics", () => {
  it("accepts a valid combination", () => {
    expect(() => validateBagTemplateEconomics(base())).not.toThrow();
  });

  it("accepts exactly the price floor", () => {
    expect(() =>
      validateBagTemplateEconomics({
        ...base(),
        priceCents: BAG_PRICE_FLOOR_CENTS,
      }),
    ).not.toThrow();
  });

  it("rejects a price below the floor with BAG_PRICE_BELOW_FLOOR", () => {
    try {
      validateBagTemplateEconomics({
        ...base(),
        priceCents: BAG_PRICE_FLOOR_CENTS - 1,
      });
      fail("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        errorCode: "BAG_PRICE_BELOW_FLOOR",
      });
    }
  });

  it("rejects min > max with BAG_VALUE_BAND_INVALID", () => {
    try {
      validateBagTemplateEconomics({
        ...base(),
        originalValueCentsMin: 30000,
        originalValueCentsMax: 25000,
      });
      fail("expected to throw");
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toMatchObject({
        errorCode: "BAG_VALUE_BAND_INVALID",
      });
    }
  });

  it("accepts min === max (a degenerate but valid band)", () => {
    expect(() =>
      validateBagTemplateEconomics({
        ...base(),
        originalValueCentsMin: 20000,
        originalValueCentsMax: 20000,
      }),
    ).not.toThrow();
  });

  it("rejects price >= originalValueCentsMin with BAG_PRICE_NOT_BELOW_VALUE", () => {
    try {
      validateBagTemplateEconomics({
        ...base(),
        priceCents: 15000,
        originalValueCentsMin: 15000,
      });
      fail("expected to throw");
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toMatchObject({
        errorCode: "BAG_PRICE_NOT_BELOW_VALUE",
      });
    }
  });

  it("rejects price above originalValueCentsMin too", () => {
    try {
      validateBagTemplateEconomics({
        ...base(),
        priceCents: 16000,
        originalValueCentsMin: 15000,
      });
      fail("expected to throw");
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toMatchObject({
        errorCode: "BAG_PRICE_NOT_BELOW_VALUE",
      });
    }
  });
});
