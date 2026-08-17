import { describe, expect, it } from "vitest";
import {
  computeTotalDeductionsCents,
  isBreakdownConsistent,
  type SettlementBreakdownInput,
} from "./settlementBreakdown";

/**
 * [I9 fix] `netPayoutCents` below is derived from the backend's ACTUAL
 * formula (backend/src/modules/settlements/settlement-math.ts's
 * computeSettlement):
 *
 *   net = gross - bagFee - bagFeeVat - withholding - membershipOffset - refundClawback
 *
 * `membershipOffsetVatCents` is deliberately NOT one of the terms
 * subtracted — it's the VAT portion INSIDE membershipOffsetCents (see
 * membership-offset.service.ts's lockAndResolveDue doc comment), reported
 * alongside it only so the commission-invoice line can split net/VAT.
 * The OLD fixture here hand-computed netPayoutCents by subtracting
 * membershipOffsetVatCents a SECOND time — a shape the backend never
 * actually produces — which is exactly how the double-counting bug in
 * computeTotalDeductionsCents stayed green.
 */
function batch(
  overrides: Partial<SettlementBreakdownInput> = {},
): SettlementBreakdownInput {
  return {
    grossCents: 100_000,
    bagFeeCents: 15_000,
    bagFeeVatCents: 3_000,
    withholdingCents: 5_000,
    membershipOffsetCents: 2_000, // includes the 400 kuruş VAT portion below
    membershipOffsetVatCents: 400,
    refundClawbackCents: 1_000,
    netPayoutCents: 74_000, // 100000 - (15000+3000+5000+2000+1000) — membershipOffsetVatCents NOT subtracted again
    ...overrides,
  };
}

describe("computeTotalDeductionsCents", () => {
  it("sums every deduction line WITHOUT double-counting membershipOffsetVatCents", () => {
    expect(computeTotalDeductionsCents(batch())).toBe(
      15_000 + 3_000 + 5_000 + 2_000 + 1_000,
    );
  });

  it("handles an all-zero batch", () => {
    expect(
      computeTotalDeductionsCents(
        batch({
          bagFeeCents: 0,
          bagFeeVatCents: 0,
          withholdingCents: 0,
          membershipOffsetCents: 0,
          membershipOffsetVatCents: 0,
          refundClawbackCents: 0,
        }),
      ),
    ).toBe(0);
  });
});

describe("isBreakdownConsistent", () => {
  it("is true when gross - deductions === netPayoutCents exactly", () => {
    expect(isBreakdownConsistent(batch())).toBe(true);
  });

  // [I9 fix] The exact regression this defect produced: any batch with a
  // real membership offset (founding-member ₺1.990 + %20 KDV -> a nonzero
  // membershipOffsetVatCents) used to fail this check on perfectly
  // healthy data, firing the finance screen's `role="alert"` "these
  // numbers don't add up" warning on the very first merchants paid.
  it("is true for a batch with a non-zero membershipOffsetVatCents — the exact shape that used to always fail", () => {
    const membershipOffsetCents = 2_388;
    const membershipOffsetVatCents = 398; // the VAT portion INSIDE membershipOffsetCents, not additional
    expect(
      isBreakdownConsistent(
        batch({
          membershipOffsetCents,
          membershipOffsetVatCents,
          netPayoutCents:
            100_000 - (15_000 + 3_000 + 5_000 + membershipOffsetCents + 1_000),
        }),
      ),
    ).toBe(true);
  });

  it("is false when netPayoutCents disagrees with the computed deductions by even 1 cent", () => {
    expect(isBreakdownConsistent(batch({ netPayoutCents: 74_001 }))).toBe(
      false,
    );
    expect(isBreakdownConsistent(batch({ netPayoutCents: 73_999 }))).toBe(
      false,
    );
  });

  it("is true for a batch with zero deductions (net === gross)", () => {
    expect(
      isBreakdownConsistent(
        batch({
          bagFeeCents: 0,
          bagFeeVatCents: 0,
          withholdingCents: 0,
          membershipOffsetCents: 0,
          membershipOffsetVatCents: 0,
          refundClawbackCents: 0,
          netPayoutCents: 100_000,
        }),
      ),
    ).toBe(true);
  });
});
