/**
 * Money parsing + the bag-template price rules, mirrored client-side from
 * backend/src/modules/offers/offer.constants.ts (BAG_PRICE_FLOOR_CENTS) and
 * bag-template.rules.ts (validateBagTemplateEconomics) — so a merchant sees
 * the floor/ordering violation instantly, with an explanation, instead of
 * after a round trip. The server (BAG_PRICE_BELOW_FLOOR / BAG_VALUE_BAND_
 * INVALID / BAG_PRICE_NOT_BELOW_VALUE) remains the real, final gate.
 */

/** ₺59.00, in kuruş — kept in sync by hand with the backend constant, same
 * as the backend's own DTO `@Min` decorator already does (see that file's
 * comment: class-validator decorators can't reference a runtime const). */
export const BAG_PRICE_FLOOR_CENTS = 5900;

/** "65", "65.00", "65,00" -> 6500. `null` for anything not a non-negative
 * number (empty input, letters, negative). */
export function parseTryToCents(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (normalized === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function centsToTryInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface BagPricingErrors {
  priceBelowFloor?: boolean;
  valueBandInvalid?: boolean;
  priceNotBelowValue?: boolean;
}

/** Mirrors bag-template.rules.ts::validateBagTemplateEconomics exactly —
 * same three checks, same order. Returns an empty object when every rule
 * passes. */
export function validateBagPricing(params: {
  priceCents: number;
  originalValueCentsMin: number;
  originalValueCentsMax: number;
}): BagPricingErrors {
  const errors: BagPricingErrors = {};
  if (params.priceCents < BAG_PRICE_FLOOR_CENTS) {
    errors.priceBelowFloor = true;
  }
  if (params.originalValueCentsMin > params.originalValueCentsMax) {
    errors.valueBandInvalid = true;
  }
  if (params.priceCents >= params.originalValueCentsMin) {
    errors.priceNotBelowValue = true;
  }
  return errors;
}
