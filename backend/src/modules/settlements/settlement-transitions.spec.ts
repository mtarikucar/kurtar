import { SettlementStatus } from "@prisma/client";
import {
  isSettlementTransitionAllowed,
  allowedFromStatusesFor,
  RECOMPUTABLE_SETTLEMENT_STATUSES,
} from "./settlement-transitions";

const ALL_STATUSES: SettlementStatus[] = [
  "PENDING",
  "CALCULATED",
  "APPROVED",
  "HELD",
  "SENT",
  "SETTLED",
  "FAILED",
];

// Every OTHER (from, to) pair — including every self-transition — must be
// denied, mirroring reservation-transitions.spec.ts's exhaustive-pairs
// discipline: this is what proves nothing was left implicitly permissive.
const ALLOWED_EDGES = new Set([
  "PENDING->CALCULATED",
  "CALCULATED->APPROVED",
  "CALCULATED->HELD",
  "APPROVED->SENT",
  "APPROVED->HELD",
  "HELD->CALCULATED",
  "SENT->SETTLED",
  "SENT->FAILED",
]);

describe("SETTLEMENT_TRANSITIONS — every (from, to) pair, explicitly", () => {
  it.each(
    ALL_STATUSES.flatMap((from) =>
      ALL_STATUSES.map((to): [SettlementStatus, SettlementStatus] => [
        from,
        to,
      ]),
    ),
  )("%s -> %s", (from, to) => {
    const expected = ALLOWED_EDGES.has(`${from}->${to}`);
    expect(isSettlementTransitionAllowed(from, to)).toBe(expected);
  });
});

describe("allowedFromStatusesFor", () => {
  it("APPROVED is reachable only from CALCULATED", () => {
    expect(allowedFromStatusesFor("APPROVED")).toEqual(["CALCULATED"]);
  });

  it("HELD is reachable from CALCULATED and APPROVED", () => {
    expect(allowedFromStatusesFor("HELD").sort()).toEqual(
      ["APPROVED", "CALCULATED"].sort(),
    );
  });

  it("SENT is reachable only from APPROVED", () => {
    expect(allowedFromStatusesFor("SENT")).toEqual(["APPROVED"]);
  });

  it("PENDING is reachable from nothing (it's the initial state)", () => {
    expect(allowedFromStatusesFor("PENDING")).toEqual([]);
  });
});

describe("RECOMPUTABLE_SETTLEMENT_STATUSES", () => {
  it("is exactly CALCULATED and HELD", () => {
    expect([...RECOMPUTABLE_SETTLEMENT_STATUSES].sort()).toEqual(
      ["CALCULATED", "HELD"].sort(),
    );
  });
});
