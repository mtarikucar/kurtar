/**
 * Pure settlement math — NO framework imports, NO Prisma types, NO Date-
 * math beyond plain arithmetic. This is deliberate (brief's "the pure math
 * file must have NO framework imports"): every money judgment call in this
 * task lives in ONE function, computeSettlement, so it can be unit-tested
 * exhaustively without a database and reused identically by every caller
 * (settlements.service.ts's create/extend, its recompute-on-approve, and
 * this file's own spec).
 *
 * ---- Money judgment calls, spelled out (see task-8-report.md for the
 * fuller writeup) ----
 *
 * 1. ROUNDING — single-sourced in `roundKurus` (round-half-up / "commercial
 *    rounding": Math.round rounds .5 away from zero for positive inputs,
 *    which every value here always is). Applied PER LINE (bagFeeVatCents,
 *    withholdingCents), NEVER on a pre-summed aggregate — the batch-level
 *    bagFeeVatCents/withholdingCents are the SUM of already-rounded
 *    per-line values, not `round(sum-of-unrounded)`. This is what makes
 *    the "every kuruş accounted for, no rounding leak" invariant hold
 *    exactly regardless of how many lines a batch has.
 *
 * 2. BAG FEE is a fixed ₺ amount per redeemed BAG (`qty`), not a
 *    percentage — `bagFeeCents_line = bagFeeCents_config * qty`, an exact
 *    integer product, never rounded (nothing to round: two integers).
 *    KDV %20 is computed ON that fixed fee, which DOES need rounding for a
 *    non-default (per-merchant override) fee that isn't a multiple of 5.
 *
 * 3. WITHHOLDING (%1 stopaj) is computed on the line's GROSS (what the
 *    consumer paid for that reservation), not on gross-net-of-bag-fee —
 *    "on the merchant's gross payout share" per the brief. Independent of
 *    the bag fee; both are separately subtracted from gross, matching the
 *    brief's literal deduction order.
 *
 * 4. DEDUCTION ORDER (also literal from the brief's invariant paragraph):
 *    gross -> bag fee (+ VAT) -> withholding -> membership offset ->
 *    refund clawback -> net. Membership offset is capped by BOTH what's
 *    still owed (`membershipDueCents`) AND what's left after fees/
 *    withholding; clawback is capped by what's left after that. Net is
 *    NEVER negative — whatever can't be absorbed becomes
 *    `carriedShortfallCents`, and the batch is `held` (settlements.service.ts
 *    maps `held` to SettlementStatus.HELD and feeds `carriedShortfallCents`
 *    into computing that merchant's NEXT batch's `priorClawbackCents`).
 *    A batch that fully absorbs everything with exactly 0 left over is
 *    NOT held — `held` is specifically "there is still money owed to the
 *    platform this batch's gross could not cover", not merely "net is 0".
 *
 * 5. "EVERY KURUŞ ACCOUNTED FOR" — the exact identity this file's spec
 *    tests, true in EVERY branch (verified algebraically, not just on the
 *    happy path):
 *
 *      grossCents + carriedShortfallCents
 *        === bagFeeCents + bagFeeVatCents + withholdingCents
 *          + membershipOffsetCents + priorClawbackCents + netPayoutCents
 *
 *    Note this uses the INPUT `priorClawbackCents` (the full demand), not
 *    the output `refundClawbackCents` (only the portion actually applied
 *    this batch) — they coincide whenever the clawback demand is fully
 *    satisfied, but diverge in the (reachable — a very cheap bag whose
 *    fixed bag fee alone exceeds its gross, for a merchant that ALSO has
 *    an outstanding clawback) case where fees alone already exceed gross
 *    AND there is a nonzero clawback demand: `refundClawbackCents` is 0
 *    in that case (nothing was available to apply), but the demand is
 *    still real and still owed, so it is still counted in
 *    `carriedShortfallCents` — using `refundClawbackCents` on the
 *    right-hand side instead would silently under-count the shortfall by
 *    exactly the unmet clawback amount, a genuine money leak.
 */

export interface SettlementInputLine {
  reservationId: string;
  /** What the consumer paid for this reservation (Reservation.totalCents) — always > 0. */
  grossCents: number;
  /** Reservation.qty — how many bags this line covers; the fixed bag fee is charged per bag. */
  qty: number;
}

export interface SettlementLineResult {
  reservationId: string;
  grossCents: number;
  bagFeeCents: number;
  bagFeeVatCents: number;
  withholdingCents: number;
}

export interface ComputeSettlementParams {
  lines: SettlementInputLine[];
  /** The platform's per-bag fee, ALREADY resolved by the caller (per-merchant
   * override or PlatformPricing as-of the batch's period date) — this
   * function never looks up pricing itself. */
  bagFeeCents: number;
  /** How much outstanding membership balance is available to offset THIS
   * batch (already merchant-scoped and, for a recompute, already has any
   * of THIS batch's own prior contribution added back — see
   * settlements.service.ts's recomputeBatch doc comment for why that
   * matters for idempotency). 0 if the merchant has none due. */
  membershipDueCents: number;
  /** Combined negative adjustment to apply THIS batch — refund clawbacks
   * newly detected against already-sent lines for this merchant, plus any
   * carriedShortfallCents rolled forward from the merchant's most recent
   * HELD batch. 0 in the common case. */
  priorClawbackCents: number;
}

export interface ComputeSettlementResult {
  grossCents: number;
  bagFeeCents: number;
  bagFeeVatCents: number;
  withholdingCents: number;
  membershipOffsetCents: number;
  refundClawbackCents: number;
  netPayoutCents: number;
  /** > 0 only when gross could not cover fees + withholding + the
   * membership/clawback demand in full — see the module doc comment. */
  carriedShortfallCents: number;
  /** carriedShortfallCents > 0 — settlements.service.ts sets
   * SettlementStatus.HELD from this rather than re-deriving it. */
  held: boolean;
  perLine: SettlementLineResult[];
}

const VAT_RATE = 0.2; // KDV %20 on the bag fee.
const WITHHOLDING_RATE = 0.01; // %1 stopaj on line gross.

/**
 * The ONE rounding rule for every fractional-kuruş money computation in
 * this codebase's settlement path. Round-half-up (Math.round rounds .5
 * away from zero — every input here is >= 0, so that is always "up"):
 * standard "nearest kuruş, ties up" commercial rounding, matching how KDV
 * amounts are conventionally rounded in Turkish invoicing. Exported so
 * every OTHER money computation this task adds (none currently need
 * fractional rounding beyond VAT/withholding) has exactly one place to
 * import it from rather than a second inline `Math.round`.
 */
export function roundKurus(value: number): number {
  return Math.round(value);
}

function computeLine(
  line: SettlementInputLine,
  bagFeeCents: number,
): SettlementLineResult {
  if (!Number.isInteger(line.grossCents) || line.grossCents < 0) {
    throw new Error(
      `computeSettlement: line ${line.reservationId} has invalid grossCents=${line.grossCents}`,
    );
  }
  if (!Number.isInteger(line.qty) || line.qty <= 0) {
    throw new Error(
      `computeSettlement: line ${line.reservationId} has invalid qty=${line.qty}`,
    );
  }
  const lineBagFeeCents = bagFeeCents * line.qty;
  return {
    reservationId: line.reservationId,
    grossCents: line.grossCents,
    bagFeeCents: lineBagFeeCents,
    bagFeeVatCents: roundKurus(lineBagFeeCents * VAT_RATE),
    withholdingCents: roundKurus(line.grossCents * WITHHOLDING_RATE),
  };
}

export function computeSettlement(
  params: ComputeSettlementParams,
): ComputeSettlementResult {
  const { lines, bagFeeCents, membershipDueCents, priorClawbackCents } = params;

  if (!Number.isInteger(bagFeeCents) || bagFeeCents < 0) {
    throw new Error(`computeSettlement: invalid bagFeeCents=${bagFeeCents}`);
  }
  if (!Number.isInteger(membershipDueCents) || membershipDueCents < 0) {
    throw new Error(
      `computeSettlement: invalid membershipDueCents=${membershipDueCents}`,
    );
  }
  if (!Number.isInteger(priorClawbackCents) || priorClawbackCents < 0) {
    throw new Error(
      `computeSettlement: invalid priorClawbackCents=${priorClawbackCents}`,
    );
  }

  const perLine = lines.map((line) => computeLine(line, bagFeeCents));

  const grossCents = sum(perLine.map((l) => l.grossCents));
  const totalBagFeeCents = sum(perLine.map((l) => l.bagFeeCents));
  const totalBagFeeVatCents = sum(perLine.map((l) => l.bagFeeVatCents));
  const totalWithholdingCents = sum(perLine.map((l) => l.withholdingCents));

  const availableBeforeMembership =
    grossCents - totalBagFeeCents - totalBagFeeVatCents - totalWithholdingCents;

  // Membership offset: capped by both what's owed and what's left. If
  // availableBeforeMembership is already negative, clamp(...) below floors
  // the cap at 0 — nothing is available to offset.
  const membershipOffsetCents = Math.min(
    membershipDueCents,
    Math.max(0, availableBeforeMembership),
  );

  const availableBeforeClawback =
    availableBeforeMembership - membershipOffsetCents;

  const refundClawbackCents = Math.min(
    priorClawbackCents,
    Math.max(0, availableBeforeClawback),
  );

  const netPayoutCents = Math.max(
    0,
    availableBeforeClawback - refundClawbackCents,
  );

  // The exact deficit: everything demanded (fees baked into gross's
  // reduction already, membershipDueCents, priorClawbackCents) minus
  // everything actually absorbed (bagFee+VAT+withholding always fully
  // absorbed off the top; membershipOffsetCents; refundClawbackCents).
  // Equivalent, and how it's actually computed: negative
  // availableBeforeClawback contributes its own magnitude, PLUS whatever
  // priorClawbackCents couldn't be covered on top of that.
  const carriedShortfallCents =
    Math.max(0, -availableBeforeClawback) +
    Math.max(0, priorClawbackCents - Math.max(0, availableBeforeClawback));

  return {
    grossCents,
    bagFeeCents: totalBagFeeCents,
    bagFeeVatCents: totalBagFeeVatCents,
    withholdingCents: totalWithholdingCents,
    membershipOffsetCents,
    refundClawbackCents,
    netPayoutCents,
    carriedShortfallCents,
    held: carriedShortfallCents > 0,
    perLine,
  };
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
