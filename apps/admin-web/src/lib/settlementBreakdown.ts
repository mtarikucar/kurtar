/**
 * Pure arithmetic over a settlement batch's money fields — used by
 * SettlementDetailPage to render a "toplam kesinti" (total deductions)
 * subtotal line and to sanity-check it against the batch's own
 * `netPayoutCents`. This module NEVER recomputes `netPayoutCents` for
 * display — the API's own number is always what's shown as "net" — it
 * only derives a subtotal and flags disagreement as a defensive integrity
 * check (the backend guarantees `gross - deductions = net` when it builds
 * a batch; this catches the case where that identity is ever violated,
 * which would itself be a real bug worth surfacing loudly on a finance
 * screen, not hiding).
 */
export interface SettlementBreakdownInput {
  grossCents: number;
  bagFeeCents: number;
  bagFeeVatCents: number;
  withholdingCents: number;
  membershipOffsetCents: number;
  membershipOffsetVatCents: number;
  refundClawbackCents: number;
  netPayoutCents: number;
}

export function computeTotalDeductionsCents(
  input: SettlementBreakdownInput,
): number {
  return (
    input.bagFeeCents +
    input.bagFeeVatCents +
    input.withholdingCents +
    input.membershipOffsetCents +
    input.membershipOffsetVatCents +
    input.refundClawbackCents
  );
}

/** True when `gross - totalDeductions === netPayoutCents` exactly. */
export function isBreakdownConsistent(
  input: SettlementBreakdownInput,
): boolean {
  return (
    input.grossCents - computeTotalDeductionsCents(input) ===
    input.netPayoutCents
  );
}
