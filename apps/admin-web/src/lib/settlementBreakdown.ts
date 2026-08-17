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
  // [I9 fix] membershipOffsetVatCents is NOT a deduction on top of
  // membershipOffsetCents — it's the VAT PORTION INSIDE it (see
  // backend/src/modules/memberships/membership-offset.service.ts's
  // lockAndResolveDue doc comment: "Returns the VAT portion of
  // appliedOffsetCents"), reported alongside it only so the commission-
  // invoice service can split net vs. VAT for the invoice line
  // (commission-invoice.service.ts derives the net portion as
  // membershipOffsetCents - membershipOffsetVatCents). The backend's own
  // net formula (settlement-math.ts's computeSettlement) subtracts
  // membershipOffsetCents exactly once — adding membershipOffsetVatCents
  // again here over-counted total deductions by that amount and made
  // isBreakdownConsistent() fail on every batch with a real membership
  // offset.
  return (
    input.bagFeeCents +
    input.bagFeeVatCents +
    input.withholdingCents +
    input.membershipOffsetCents +
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
