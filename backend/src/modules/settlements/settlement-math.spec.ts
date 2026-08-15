import {
  allocateClawback,
  applyRateCents,
  ClawbackCandidate,
  computeSettlement,
  roundKurus,
  totalClawbackDemandCents,
} from "./settlement-math";

describe("roundKurus", () => {
  it("rounds .5 up (away from zero for the only sign this ever sees: non-negative)", () => {
    expect(roundKurus(125.5)).toBe(126);
    expect(roundKurus(66.6)).toBe(67);
    expect(roundKurus(0.4)).toBe(0);
    expect(roundKurus(0.5)).toBe(1);
    expect(roundKurus(100)).toBe(100);
  });
});

describe("applyRateCents", () => {
  it("computes an exact-ratio percentage without a decimal-literal rate", () => {
    expect(applyRateCents(2500, 20, 100)).toBe(500); // KDV %20 of 2500
    expect(applyRateCents(333, 20, 100)).toBe(67); // 66.6 -> 67
    expect(applyRateCents(12050, 1, 100)).toBe(121); // 120.5 -> 121, exact tie
    expect(applyRateCents(0, 20, 100)).toBe(0);
  });
});

/** Asserts the universal "every kuruş accounted for" identity from
 * settlement-math.ts's module doc comment — deliberately using the INPUT
 * `priorClawbackCents`, not the output `refundClawbackCents`, on the
 * right-hand side (see that comment for why they diverge whenever a
 * clawback demand is only partially satisfied). */
function expectFullyAccountedFor(
  result: ReturnType<typeof computeSettlement>,
  priorClawbackCents: number,
) {
  expect(result.grossCents + result.carriedShortfallCents).toBe(
    result.bagFeeCents +
      result.bagFeeVatCents +
      result.withholdingCents +
      result.membershipOffsetCents +
      priorClawbackCents +
      result.netPayoutCents,
  );
}

describe("computeSettlement", () => {
  it("computes a single-line happy path with the default bag fee", () => {
    const result = computeSettlement({
      lines: [{ reservationId: "r1", grossCents: 15000, qty: 1 }],
      bagFeeCents: 2500,
      membershipDueCents: 0,
      priorClawbackCents: 0,
    });

    expect(result).toMatchObject({
      grossCents: 15000,
      bagFeeCents: 2500,
      bagFeeVatCents: 500, // round(2500 * 20/100)
      // [P3] withholding base = gross - bagFee - bagFeeVat = 15000-2500-500
      // = 12000 (the merchant's EARNING, not the raw sale gross) ->
      // round(12000 * 1/100) = 120.
      withholdingCents: 120,
      membershipOffsetCents: 0,
      refundClawbackCents: 0,
      carriedShortfallCents: 0,
      held: false,
      netPayoutCents: 11880, // 15000 - 2500 - 500 - 120
    });
    expect(result.perLine).toEqual([
      {
        reservationId: "r1",
        grossCents: 15000,
        bagFeeCents: 2500,
        bagFeeVatCents: 500,
        withholdingCents: 120,
      },
    ]);
    expectFullyAccountedFor(result, 0);
  });

  it("multiplies the fixed bag fee by qty (per redeemed BAG, not per reservation)", () => {
    const result = computeSettlement({
      lines: [{ reservationId: "r1", grossCents: 30000, qty: 2 }],
      bagFeeCents: 2500,
      membershipDueCents: 0,
      priorClawbackCents: 0,
    });
    expect(result.bagFeeCents).toBe(5000); // 2500 * 2
    expect(result.bagFeeVatCents).toBe(1000); // round(5000 * 20/100)
    // withholding base = 30000-5000-1000 = 24000 -> round(240) = 240
    expect(result.withholdingCents).toBe(240);
    expectFullyAccountedFor(result, 0);
  });

  it("honors a non-default (founding-member override) bag fee that doesn't round evenly", () => {
    const result = computeSettlement({
      lines: [{ reservationId: "r1", grossCents: 10000, qty: 1 }],
      bagFeeCents: 333,
      membershipDueCents: 0,
      priorClawbackCents: 0,
    });
    expect(result.bagFeeCents).toBe(333);
    expect(result.bagFeeVatCents).toBe(67); // round(333 * 20/100 = 66.6) -> 67, not truncated to 66
    // withholding base = 10000-333-67 = 9600 -> round(96) = 96
    expect(result.withholdingCents).toBe(96);
    expectFullyAccountedFor(result, 0);
  });

  it("per-line rounding is summed, not re-derived from a rounded aggregate — proven with a withholding exact-.5 tie", () => {
    const result = computeSettlement({
      lines: [
        // withholding base = 15050-2500-500 = 12050 -> 120.5 -> 121 (tie, rounds up)
        { reservationId: "r1", grossCents: 15050, qty: 1 },
        // bagFee=5000,vat=1000; base = 8080-5000-1000 = 2080 -> 20.8 -> 21
        { reservationId: "r2", grossCents: 8080, qty: 2 },
      ],
      bagFeeCents: 2500,
      membershipDueCents: 0,
      priorClawbackCents: 0,
    });

    expect(result.perLine).toEqual([
      {
        reservationId: "r1",
        grossCents: 15050,
        bagFeeCents: 2500,
        bagFeeVatCents: 500,
        withholdingCents: 121,
      },
      {
        reservationId: "r2",
        grossCents: 8080,
        bagFeeCents: 5000, // 2500 * 2
        bagFeeVatCents: 1000,
        withholdingCents: 21,
      },
    ]);
    // Aggregate = sum of the ALREADY-rounded per-line values (121 + 21 =
    // 142), never round(sum-of-unrounded) — proven via grossCents/
    // bagFeeCents/bagFeeVatCents, which are exact sums by construction.
    expect(result.grossCents).toBe(23130);
    expect(result.bagFeeCents).toBe(7500);
    expect(result.bagFeeVatCents).toBe(1500);
    expect(result.withholdingCents).toBe(142);
    expect(result.netPayoutCents).toBe(13988); // 23130 - 7500 - 1500 - 142
    expect(result.held).toBe(false);
    expectFullyAccountedFor(result, 0);
  });

  it("membership offset is capped by what's still OWED (due), not by what's available", () => {
    const result = computeSettlement({
      lines: [{ reservationId: "r1", grossCents: 100000, qty: 1 }],
      bagFeeCents: 2500,
      membershipDueCents: 50000,
      priorClawbackCents: 0,
    });
    // withholding base = 100000-2500-500 = 97000 -> round(970) = 970
    // available before membership = 100000 - 2500 - 500 - 970 = 96030
    expect(result.withholdingCents).toBe(970);
    expect(result.membershipOffsetCents).toBe(50000); // capped by due, not the larger 96030
    expect(result.netPayoutCents).toBe(46030); // 96030 - 50000
    expect(result.held).toBe(false);
    expectFullyAccountedFor(result, 0);
  });

  it("membership offset is capped by what's AVAILABLE, not by what's owed — net lands exactly on 0, and that is NOT held", () => {
    const result = computeSettlement({
      lines: [{ reservationId: "r1", grossCents: 10000, qty: 1 }],
      bagFeeCents: 2500,
      membershipDueCents: 199000, // full annual fee still owed, far more than available
      priorClawbackCents: 0,
    });
    // withholding base = 10000-2500-500 = 7000 -> round(70) = 70
    // available before membership = 10000 - 2500 - 500 - 70 = 6930
    expect(result.withholdingCents).toBe(70);
    expect(result.membershipOffsetCents).toBe(6930); // capped by availability
    expect(result.netPayoutCents).toBe(0);
    expect(result.carriedShortfallCents).toBe(0); // fully absorbed, nothing owed to the PLATFORM
    expect(result.held).toBe(false); // net=0 by full absorption is NOT the same as held
    expectFullyAccountedFor(result, 0);
  });

  it("a refund clawback that's fully absorbed reduces net with zero shortfall", () => {
    const result = computeSettlement({
      lines: [{ reservationId: "r1", grossCents: 50000, qty: 1 }],
      bagFeeCents: 2500,
      membershipDueCents: 0,
      priorClawbackCents: 10000,
    });
    // withholding base = 50000-2500-500 = 47000 -> round(470) = 470
    // available = 50000 - 2500 - 500 - 470 = 46530
    expect(result.withholdingCents).toBe(470);
    expect(result.refundClawbackCents).toBe(10000);
    expect(result.netPayoutCents).toBe(36530);
    expect(result.carriedShortfallCents).toBe(0);
    expect(result.held).toBe(false);
    expectFullyAccountedFor(result, 10000);
  });

  it("a refund clawback larger than what's available is only PARTIALLY applied, and the remainder is carried forward as shortfall", () => {
    const result = computeSettlement({
      lines: [{ reservationId: "r1", grossCents: 50000, qty: 1 }],
      bagFeeCents: 2500,
      membershipDueCents: 0,
      priorClawbackCents: 60000, // bigger than the 46530 available
    });
    expect(result.refundClawbackCents).toBe(46530); // everything that WAS available
    expect(result.netPayoutCents).toBe(0);
    expect(result.carriedShortfallCents).toBe(13470); // 60000 - 46530, the unmet remainder
    expect(result.held).toBe(true);
    expectFullyAccountedFor(result, 60000);
  });

  it("negative net (fixed fees alone exceed gross) -> HELD, full deficit carried, membership left untouched", () => {
    const result = computeSettlement({
      lines: [{ reservationId: "r1", grossCents: 1000, qty: 1 }],
      bagFeeCents: 2500,
      membershipDueCents: 100000, // must stay untouched — nothing was available to offset with
      priorClawbackCents: 0,
    });
    // withholding base = max(0, 1000-2500-500) = 0 -> withholding = 0
    // available before membership = 1000 - 2500 - 500 - 0 = -2000
    expect(result.withholdingCents).toBe(0);
    expect(result.membershipOffsetCents).toBe(0);
    expect(result.refundClawbackCents).toBe(0);
    expect(result.netPayoutCents).toBe(0);
    expect(result.carriedShortfallCents).toBe(2000);
    expect(result.held).toBe(true);
    expectFullyAccountedFor(result, 0);
  });

  it("[dual edge case] fixed fees exceed gross AND there is a live clawback demand — refundClawbackCents is 0 (nothing was available), but the FULL clawback demand still lands in carriedShortfallCents, not silently dropped", () => {
    const result = computeSettlement({
      lines: [{ reservationId: "r1", grossCents: 1000, qty: 1 }],
      bagFeeCents: 2500,
      membershipDueCents: 0,
      priorClawbackCents: 5000,
    });
    // available before membership = 1000 - 2500 - 500 - 0 = -2000
    expect(result.refundClawbackCents).toBe(0); // nothing could be applied
    expect(result.netPayoutCents).toBe(0);
    // 2000 (fee deficit) + 5000 (entirely-unmet clawback demand) — NOT
    // just 2000: using refundClawbackCents (0) instead of the input
    // priorClawbackCents (5000) here would silently under-count this by
    // exactly 5000, a real money leak the module doc comment calls out.
    expect(result.carriedShortfallCents).toBe(7000);
    expect(result.held).toBe(true);
    expectFullyAccountedFor(result, 5000);
  });

  it("throws on a negative or non-integer grossCents", () => {
    expect(() =>
      computeSettlement({
        lines: [{ reservationId: "r1", grossCents: -100, qty: 1 }],
        bagFeeCents: 2500,
        membershipDueCents: 0,
        priorClawbackCents: 0,
      }),
    ).toThrow();
    expect(() =>
      computeSettlement({
        lines: [{ reservationId: "r1", grossCents: 100.5, qty: 1 }],
        bagFeeCents: 2500,
        membershipDueCents: 0,
        priorClawbackCents: 0,
      }),
    ).toThrow();
  });

  it("throws on a zero or negative qty", () => {
    expect(() =>
      computeSettlement({
        lines: [{ reservationId: "r1", grossCents: 1000, qty: 0 }],
        bagFeeCents: 2500,
        membershipDueCents: 0,
        priorClawbackCents: 0,
      }),
    ).toThrow();
  });

  it("throws on negative bagFeeCents/membershipDueCents/priorClawbackCents", () => {
    const base = {
      lines: [{ reservationId: "r1", grossCents: 1000, qty: 1 }],
      bagFeeCents: 2500,
      membershipDueCents: 0,
      priorClawbackCents: 0,
    };
    expect(() => computeSettlement({ ...base, bagFeeCents: -1 })).toThrow();
    expect(() =>
      computeSettlement({ ...base, membershipDueCents: -1 }),
    ).toThrow();
    expect(() =>
      computeSettlement({ ...base, priorClawbackCents: -1 }),
    ).toThrow();
  });

  it("an empty line set (pure clawback/shortfall-carry batch) still computes correctly", () => {
    const result = computeSettlement({
      lines: [],
      bagFeeCents: 2500,
      membershipDueCents: 0,
      priorClawbackCents: 3000,
    });
    expect(result.grossCents).toBe(0);
    expect(result.refundClawbackCents).toBe(0);
    expect(result.carriedShortfallCents).toBe(3000);
    expect(result.held).toBe(true);
    expect(result.perLine).toEqual([]);
    expectFullyAccountedFor(result, 3000);
  });
});

// ---------------------------------------------------------------------------
// [Fix round #4] allocateClawback — the invariant tests, not example tests.
//
// Four audits found four instances of "the batch row was rewritten and a
// line row was not". These assert the two properties that make that
// unrepresentable rather than merely absent in the cases anyone thought
// of: (1) EXACTLY one result per candidate, always; (2) the results sum
// back to exactly what was allocated, always.
// ---------------------------------------------------------------------------

function candidate(
  reservationId: string,
  fullDemandCents: number,
  otherBatchesRecoveredCents = 0,
) {
  return { reservationId, fullDemandCents, otherBatchesRecoveredCents };
}

/** The two structural invariants, asserted on every result in this block. */
function expectAllocationInvariants(
  candidates: ClawbackCandidate[],
  applied: number,
  external: number,
  result: ReturnType<typeof allocateClawback>,
) {
  // (1) One entry per candidate, in input order — no candidate can be
  // silently dropped, so the caller's write loop cannot silently skip one.
  expect(result.perCandidate).toHaveLength(candidates.length);
  expect(result.perCandidate.map((a) => a.reservationId)).toEqual(
    candidates.map((c) => c.reservationId),
  );
  // (2) Every kuruş applied is attributed to exactly one place.
  const toLines = result.perCandidate.reduce((s, a) => s + a.absorbedCents, 0);
  expect(result.externalAbsorbedCents + toLines).toBe(applied);
  expect(result.externalAbsorbedCents).toBeLessThanOrEqual(external);
  // (3) Nothing is ever over-recovered, and cumulative/flag agree.
  for (let i = 0; i < candidates.length; i++) {
    const a = result.perCandidate[i];
    const c = candidates[i];
    expect(a.absorbedCents).toBeGreaterThanOrEqual(0);
    expect(a.cumulativeCents).toBe(
      c.otherBatchesRecoveredCents + a.absorbedCents,
    );
    expect(a.cumulativeCents).toBeLessThanOrEqual(
      Math.max(c.fullDemandCents, c.otherBatchesRecoveredCents),
    );
    expect(a.fullyResolved).toBe(
      c.fullDemandCents > 0 && a.cumulativeCents >= c.fullDemandCents,
    );
  }
}

describe("allocateClawback — structural invariants", () => {
  it("emits a result for EVERY candidate even when nothing is left to allocate (the starved-candidate case that used to `break` before the write)", () => {
    const candidates = [candidate("A", 1000), candidate("B", 2000)];
    const result = allocateClawback({
      appliedClawbackCents: 500,
      externalDemandCents: 0,
      candidates,
    });
    expect(result.perCandidate).toEqual([
      {
        reservationId: "A",
        absorbedCents: 500,
        cumulativeCents: 500,
        fullyResolved: false,
      },
      {
        reservationId: "B",
        absorbedCents: 0,
        cumulativeCents: 0,
        fullyResolved: false,
      },
    ]);
    expectAllocationInvariants(candidates, 500, 0, result);
  });

  it("emits a zero result for EVERY candidate when the batch could absorb nothing at all (the `refundClawbackCents === 0` case that used to `break` on the first iteration)", () => {
    const candidates = [candidate("A", 14850), candidate("B", 2000)];
    const result = allocateClawback({
      appliedClawbackCents: 0,
      externalDemandCents: 18850,
      candidates,
    });
    expect(result.externalAbsorbedCents).toBe(0);
    expect(result.perCandidate.every((a) => a.absorbedCents === 0)).toBe(true);
    expect(result.perCandidate.every((a) => a.fullyResolved === false)).toBe(
      true,
    );
    expectAllocationInvariants(candidates, 0, 18850, result);
  });

  it("emits a zero result for a candidate other batches already fully recovered (the `continue` case that used to skip the write)", () => {
    const candidates = [candidate("A", 1000, 1000), candidate("B", 500)];
    const result = allocateClawback({
      appliedClawbackCents: 500,
      externalDemandCents: 0,
      candidates,
    });
    expect(result.perCandidate[0]).toEqual({
      reservationId: "A",
      absorbedCents: 0,
      cumulativeCents: 1000,
      fullyResolved: true,
    });
    expect(result.perCandidate[1].absorbedCents).toBe(500);
    expectAllocationInvariants(candidates, 500, 0, result);
  });

  it("absorbs the inherited external demand FIRST, then per-line demand in the given (FIFO) order", () => {
    const candidates = [candidate("A", 1000), candidate("B", 1000)];
    const result = allocateClawback({
      appliedClawbackCents: 1500,
      externalDemandCents: 800,
      candidates,
    });
    expect(result.externalAbsorbedCents).toBe(800);
    expect(result.perCandidate.map((a) => a.absorbedCents)).toEqual([700, 0]);
    expectAllocationInvariants(candidates, 1500, 800, result);
  });

  it("tops a partially-recovered line up to exactly its full demand and marks it resolved — never past it", () => {
    const candidates = [candidate("A", 1000, 400)];
    const result = allocateClawback({
      appliedClawbackCents: 900,
      externalDemandCents: 300,
      candidates,
    });
    expect(result.externalAbsorbedCents).toBe(300);
    expect(result.perCandidate[0]).toEqual({
      reservationId: "A",
      absorbedCents: 600,
      cumulativeCents: 1000,
      fullyResolved: true,
    });
    expectAllocationInvariants(candidates, 900, 300, result);
  });

  it("holds the invariants across an exhaustive sweep of applied amounts, external demands and prior-recovery mixes", () => {
    const shapes: ClawbackCandidate[][] = [
      [],
      [candidate("A", 0)],
      [candidate("A", 1000)],
      [candidate("A", 1000, 1000)],
      [candidate("A", 1000, 250), candidate("B", 2000)],
      [candidate("A", 1), candidate("B", 1), candidate("C", 1)],
      [candidate("A", 3000, 2999), candidate("B", 7), candidate("C", 0)],
    ];
    for (const candidates of shapes) {
      const lineDemand = totalClawbackDemandCents(candidates);
      for (const external of [0, 1, 750, 100000]) {
        // The only supported usage: the demand the caller charges is the
        // demand the caller allocates. Every reachable `applied` is a
        // clamp of that total (computeSettlement can only ever reduce it).
        const total = lineDemand + external;
        for (const applied of [0, 1, Math.floor(total / 2), total]) {
          if (applied > total) continue;
          const result = allocateClawback({
            appliedClawbackCents: applied,
            externalDemandCents: external,
            candidates,
          });
          expectAllocationInvariants(candidates, applied, external, result);
        }
      }
    }
  });

  it("throws rather than silently leaving kuruş unattributed when the caller allocates more than it charged", () => {
    expect(() =>
      allocateClawback({
        appliedClawbackCents: 5000,
        externalDemandCents: 0,
        candidates: [candidate("A", 1000)],
      }),
    ).toThrow(/could not be attributed/);
  });

  it("rejects non-integer / negative money", () => {
    expect(() =>
      allocateClawback({
        appliedClawbackCents: 10.5,
        externalDemandCents: 0,
        candidates: [],
      }),
    ).toThrow();
    expect(() =>
      allocateClawback({
        appliedClawbackCents: 0,
        externalDemandCents: -1,
        candidates: [],
      }),
    ).toThrow();
  });
});
