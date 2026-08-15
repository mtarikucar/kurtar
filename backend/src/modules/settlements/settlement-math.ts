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
 * 3. WITHHOLDING (%1 stopaj) base — [Fix round, P3, POLICY DECISION,
 *    REQUIRES MALİ MÜŞAVİR SIGN-OFF]: computed on the merchant's actual
 *    EARNING for the line — gross MINUS the platform's own fee (bag fee +
 *    its KDV) — never on the raw sale gross. Rationale (controller's P3
 *    decision): GVK md. 94 as amended by Law 7524 taxes "aracı hizmet
 *    sağlayıcıların hizmet sağlayıcılarına yaptıkları ÖDEMELER üzerinden"
 *    — the withholding base is the PAYMENT actually made to the seller
 *    (i.e. what the platform hands the merchant before its own commission
 *    is even in the picture is irrelevant; what matters is what's left
 *    AFTER the platform's cut), not the customer's total sale price.
 *    `WITHHOLDING_BASE` below is the one named, documented place this
 *    policy lives — flip it here, not by hunting through the deduction
 *    chain, if a mali müşavir determines the base should change.
 *    Deliberately NOT reduced by the membership offset: membership offset
 *    is debt collection against the merchant (recovering money already
 *    earned), not a reduction of what the platform paid the seller for
 *    THIS sale — so it plays no part in the withholding base, exactly
 *    like it plays no part in bag-fee/VAT.
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

// [Minor fix, review round] Rates expressed as exact integer ratios
// (numerator/denominator), never a decimal literal — 0.2 and 0.01 cannot
// be represented exactly in IEEE-754 binary floating point (0.2 is
// actually ...00000000000000011102230246251565404236316680908203125 under
// the hood), so `value * 0.2` bakes that imprecision into the multiplier
// itself. `(value * 20) / 100` keeps every intermediate step exact for
// integer `value` (kuruş are always integers) — the ONLY float-adjacent
// operation is the final division, immediately absorbed by roundKurus.
// This is the most literal reading of "no float math" achievable in a
// language whose only numeric type is a double.
const VAT_RATE_NUMERATOR = 20; // KDV %20 on the bag fee.
const VAT_RATE_DENOMINATOR = 100;
const WITHHOLDING_RATE_NUMERATOR = 1; // %1 stopaj.
const WITHHOLDING_RATE_DENOMINATOR = 100;

/**
 * The ONE rounding rule for every fractional-kuruş money computation in
 * this codebase's settlement path. Round-half-up (Math.round rounds .5
 * away from zero — every input here is >= 0, so that is always "up"):
 * standard "nearest kuruş, ties up" commercial rounding, matching how KDV
 * amounts are conventionally rounded in Turkish invoicing. Exported so
 * every OTHER money computation this task adds (membership VAT included)
 * has exactly one place to import it from rather than a second inline
 * `Math.round`.
 */
export function roundKurus(value: number): number {
  return Math.round(value);
}

/** `roundKurus((baseCents * numerator) / denominator)` — the shared
 * "apply an exact-ratio percentage, then round once" helper both VAT and
 * withholding (and, outside this file, memberships/membership-offset.
 * service.ts's mirrored VAT split) go through, so there is exactly one
 * formula shape for "a rate applied to a kuruş amount" in the whole
 * settlement path. */
export function applyRateCents(
  baseCents: number,
  numerator: number,
  denominator: number,
): number {
  return roundKurus((baseCents * numerator) / denominator);
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
  const lineBagFeeVatCents = applyRateCents(
    lineBagFeeCents,
    VAT_RATE_NUMERATOR,
    VAT_RATE_DENOMINATOR,
  );
  // [Fix round, P3] Withholding base = the merchant's actual earning on
  // this line (gross minus the platform's own bag fee AND its KDV), never
  // the raw sale gross — see the module doc comment's GVK md. 94 / Law
  // 7524 citation. Floored at 0: a line whose fixed bag fee alone exceeds
  // its gross has no positive "earning" to withhold tax against.
  const withholdingBaseCents = Math.max(
    0,
    line.grossCents - lineBagFeeCents - lineBagFeeVatCents,
  );
  return {
    reservationId: line.reservationId,
    grossCents: line.grossCents,
    bagFeeCents: lineBagFeeCents,
    bagFeeVatCents: lineBagFeeVatCents,
    withholdingCents: applyRateCents(
      withholdingBaseCents,
      WITHHOLDING_RATE_NUMERATOR,
      WITHHOLDING_RATE_DENOMINATOR,
    ),
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

// ---------------------------------------------------------------------------
// [Fix round #4] Clawback ALLOCATION — deciding which line each kuruş of
// `computeSettlement`'s `refundClawbackCents` output was withheld against.
//
// This used to be an imperative loop inside
// settlement-batch-builder.service.ts that wrote a database row per
// iteration, guarded by `break` and `continue`. Both guards skipped the
// write, so a candidate the loop declined to fund kept whatever the
// PREVIOUS pass had written on it while the batch row was rewritten
// without it — the batch ledger and the line ledger diverged, and the
// difference was money that matched no recovery query afterwards.
//
// Splitting the DECISION (here, pure, no I/O) from the WRITE (there,
// exhaustive, one persisted row per element of `perCandidate`) is what
// makes that impossible rather than merely fixed: this function's contract
// is that `perCandidate` has EXACTLY ONE entry per input candidate, in
// input order, with `absorbedCents: 0` spelled out for every candidate it
// funds nothing — there is no "skipped" outcome for a caller to forget to
// persist, and the caller's write path has no branch to skip it with.
// ---------------------------------------------------------------------------

export interface ClawbackCandidate {
  reservationId: string;
  /** The line's full theoretical demand: grossCents - bagFeeCents -
   * bagFeeVatCents - withholdingCents, floored at 0 by the caller. */
  fullDemandCents: number;
  /** How much of that demand has already been recovered by batches OTHER
   * than the one now allocating. The caller establishes this structurally
   * — it deletes its own allocation rows BEFORE reading the ledger — never
   * by subtracting its own remembered contribution back out. */
  otherBatchesRecoveredCents: number;
}

export interface ClawbackAllocationLine {
  reservationId: string;
  /** What the allocating batch withholds against this line THIS pass. 0 is
   * a real, persisted outcome (it means "delete my claim"), not a skip. */
  absorbedCents: number;
  /** otherBatchesRecoveredCents + absorbedCents — the line's new total
   * recovered across all batches. */
  cumulativeCents: number;
  /** cumulativeCents covers the line's full demand. The caller stamps
   * `clawbackAppliedAt` from exactly this, in both directions — a line
   * that stops being fully resolved must have the flag CLEARED, or its
   * unrecovered residual becomes invisible to every recovery query. */
  fullyResolved: boolean;
}

export interface ClawbackAllocationResult {
  /** Applied to the batch's inherited (non-line-attributable) external
   * demand — oldest debt first, ahead of any per-line demand. */
  externalAbsorbedCents: number;
  /** EXACTLY ONE entry per input candidate, in input order. Always. */
  perCandidate: ClawbackAllocationLine[];
}

/** What is still outstanding against a single line, as of everything the
 * OTHER batches have recovered. The one definition — `totalClawbackDemandCents`
 * (which feeds `computeSettlement`'s `priorClawbackCents`) and
 * `allocateClawback` (which spends its output) both go through it, so the
 * demand that is charged and the demand that is attributable can never be
 * two different numbers. */
export function remainingClawbackDemandCents(c: ClawbackCandidate): number {
  return Math.max(0, c.fullDemandCents - c.otherBatchesRecoveredCents);
}

export function totalClawbackDemandCents(
  candidates: ClawbackCandidate[],
): number {
  return sum(candidates.map(remainingClawbackDemandCents));
}

/**
 * Splits `appliedClawbackCents` (what `computeSettlement` decided this
 * batch could actually absorb) across the inherited external demand first,
 * then the per-line candidates in the order given (the caller supplies
 * oldest-redemption-first, so recovery is FIFO).
 *
 * Throws if the split does not exhaust `appliedClawbackCents` exactly.
 * That is unreachable when the caller derives `priorClawbackCents` as
 * `externalDemandCents + totalClawbackDemandCents(candidates)` — which is
 * the only supported usage — so the throw is a tripwire for a future
 * caller that computes the demand one way and allocates it another. It is
 * deliberately loud: silently leaving kuruş unattributed is precisely the
 * bug class this function exists to make impossible.
 */
export function allocateClawback(params: {
  appliedClawbackCents: number;
  externalDemandCents: number;
  candidates: ClawbackCandidate[];
}): ClawbackAllocationResult {
  const { appliedClawbackCents, externalDemandCents, candidates } = params;

  if (!Number.isInteger(appliedClawbackCents) || appliedClawbackCents < 0) {
    throw new Error(
      `allocateClawback: invalid appliedClawbackCents=${appliedClawbackCents}`,
    );
  }
  if (!Number.isInteger(externalDemandCents) || externalDemandCents < 0) {
    throw new Error(
      `allocateClawback: invalid externalDemandCents=${externalDemandCents}`,
    );
  }

  const externalAbsorbedCents = Math.min(
    externalDemandCents,
    appliedClawbackCents,
  );
  let remaining = appliedClawbackCents - externalAbsorbedCents;

  // `.map` — not a `for` loop with guards. Every candidate produces an
  // entry no matter what is left to allocate; "nothing left" shows up as
  // `absorbedCents: 0`, never as a missing entry.
  const perCandidate = candidates.map((candidate) => {
    const absorbedCents = Math.min(
      remaining,
      remainingClawbackDemandCents(candidate),
    );
    remaining -= absorbedCents;
    const cumulativeCents =
      candidate.otherBatchesRecoveredCents + absorbedCents;
    return {
      reservationId: candidate.reservationId,
      absorbedCents,
      cumulativeCents,
      fullyResolved:
        candidate.fullDemandCents > 0 &&
        cumulativeCents >= candidate.fullDemandCents,
    };
  });

  if (remaining !== 0) {
    throw new Error(
      `allocateClawback: ${remaining} kuruş of applied clawback could not be attributed to any candidate — appliedClawbackCents=${appliedClawbackCents} exceeds externalDemandCents=${externalDemandCents} plus the candidates' remaining demand`,
    );
  }

  return { externalAbsorbedCents, perCandidate };
}
