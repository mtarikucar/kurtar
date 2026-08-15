import { describe, expect, it } from "vitest";
import {
  computeTotalDeductionsCents,
  isBreakdownConsistent,
  type SettlementBreakdownInput,
} from "./settlementBreakdown";

function batch(
  overrides: Partial<SettlementBreakdownInput> = {},
): SettlementBreakdownInput {
  return {
    grossCents: 100_000,
    bagFeeCents: 15_000,
    bagFeeVatCents: 3_000,
    withholdingCents: 5_000,
    membershipOffsetCents: 2_000,
    membershipOffsetVatCents: 400,
    refundClawbackCents: 1_000,
    netPayoutCents: 73_600, // 100000 - (15000+3000+5000+2000+400+1000)
    ...overrides,
  };
}

describe("computeTotalDeductionsCents", () => {
  it("sums every deduction line", () => {
    expect(computeTotalDeductionsCents(batch())).toBe(
      15_000 + 3_000 + 5_000 + 2_000 + 400 + 1_000,
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

  it("is false when netPayoutCents disagrees with the computed deductions by even 1 cent", () => {
    expect(isBreakdownConsistent(batch({ netPayoutCents: 73_601 }))).toBe(
      false,
    );
    expect(isBreakdownConsistent(batch({ netPayoutCents: 73_599 }))).toBe(
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
