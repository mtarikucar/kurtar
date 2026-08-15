import { ComplaintStatus } from "@prisma/client";
import {
  allowedFromStatusesFor,
  COMPLAINT_TRANSITIONS,
  isComplaintTransitionAllowed,
} from "./complaint-transitions";

const ALL_STATUSES: ComplaintStatus[] = [
  "OPEN",
  "MERCHANT_RESPONDED",
  "RESOLVED",
  "ESCALATED",
];

describe("COMPLAINT_TRANSITIONS — exhaustive pairs", () => {
  const expected: Record<ComplaintStatus, ComplaintStatus[]> = {
    OPEN: ["MERCHANT_RESPONDED", "RESOLVED", "ESCALATED"],
    MERCHANT_RESPONDED: ["RESOLVED", "ESCALATED"],
    ESCALATED: ["RESOLVED"],
    RESOLVED: [],
  };

  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const allowed = expected[from].includes(to);
      it(`${from} -> ${to} is ${allowed ? "ALLOWED" : "DENIED"}`, () => {
        expect(isComplaintTransitionAllowed(from, to)).toBe(allowed);
      });
    }
  }

  it("every status is declared in the map (no silently-missing entries)", () => {
    expect(Object.keys(COMPLAINT_TRANSITIONS).sort()).toEqual(
      [...ALL_STATUSES].sort(),
    );
  });

  it("RESOLVED is terminal — no outbound edges", () => {
    expect(COMPLAINT_TRANSITIONS.RESOLVED).toEqual([]);
  });
});

describe("allowedFromStatusesFor", () => {
  it("MERCHANT_RESPONDED is reachable only from OPEN", () => {
    expect(allowedFromStatusesFor("MERCHANT_RESPONDED")).toEqual(["OPEN"]);
  });

  it("RESOLVED is reachable from OPEN, MERCHANT_RESPONDED, and ESCALATED", () => {
    expect(allowedFromStatusesFor("RESOLVED").sort()).toEqual(
      ["OPEN", "MERCHANT_RESPONDED", "ESCALATED"].sort(),
    );
  });

  it("ESCALATED is reachable from OPEN and MERCHANT_RESPONDED (admin manual OR the SLA cron's auto-breach)", () => {
    expect(allowedFromStatusesFor("ESCALATED").sort()).toEqual(
      ["OPEN", "MERCHANT_RESPONDED"].sort(),
    );
  });

  it("OPEN is reachable from nothing — it is only ever the fresh-row default", () => {
    expect(allowedFromStatusesFor("OPEN")).toEqual([]);
  });
});
