/**
 * Pure impact-ledger arithmetic (brief §3) — no framework imports, no DB.
 * Kept separate from ImpactLedgerHandler so the money/environmental math
 * is unit-testable without a Prisma mock, same "pure core, thin
 * framework shell" split as settlement-math.ts.
 */

export interface ImpactLineInput {
  qty: number;
  co2ePerBagGrams: number;
  totalCents: number;
  originalValueCentsMin: number;
  originalValueCentsMax: number;
}

export interface ImpactLine {
  mealsSaved: number;
  co2eGrams: number;
  moneySavedCents: number;
}

/** mealsSaved is a straight qty passthrough — one bag redeemed is one
 * meal saved, regardless of how many portions the bag physically holds
 * (the brief's own wording: "mealsSaved = qty"). */
export function computeMealsSaved(qty: number): number {
  return qty;
}

export function computeCo2eGrams(qty: number, co2ePerBagGrams: number): number {
  return qty * co2ePerBagGrams;
}

/**
 * moneySavedCents = (min+max)/2 * qty − totalCents, floored at 0 — a
 * consumer who somehow paid more than the bag's estimated original value
 * (a data-entry outlier, a promo-priced original value) never shows a
 * NEGATIVE saving; that reads as a bug, not "you saved -₺5". Uses
 * Math.floor on the midpoint product (not Math.round) so this can never
 * report a saving a kuruş higher than what the integer division actually
 * supports — consistent with "never overstate a headline number."
 */
export function computeMoneySavedCents(
  qty: number,
  totalCents: number,
  originalValueCentsMin: number,
  originalValueCentsMax: number,
): number {
  const midpointCents = Math.floor(
    (originalValueCentsMin + originalValueCentsMax) / 2,
  );
  const estimatedOriginalCents = midpointCents * qty;
  return Math.max(0, estimatedOriginalCents - totalCents);
}

export function computeImpactLine(input: ImpactLineInput): ImpactLine {
  return {
    mealsSaved: computeMealsSaved(input.qty),
    co2eGrams: computeCo2eGrams(input.qty, input.co2ePerBagGrams),
    moneySavedCents: computeMoneySavedCents(
      input.qty,
      input.totalCents,
      input.originalValueCentsMin,
      input.originalValueCentsMax,
    ),
  };
}
