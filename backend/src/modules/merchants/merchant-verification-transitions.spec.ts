import { MerchantVerificationStatus } from "@prisma/client";
import {
  allowedFromStatusesFor,
  isMerchantVerificationTransitionAllowed,
  MERCHANT_VERIFICATION_TRANSITIONS,
} from "./merchant-verification-transitions";

const ALL_STATUSES: MerchantVerificationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
];

describe("MERCHANT_VERIFICATION_TRANSITIONS", () => {
  it("covers every enum member as a key", () => {
    expect(Object.keys(MERCHANT_VERIFICATION_TRANSITIONS).sort()).toEqual(
      [...ALL_STATUSES].sort(),
    );
  });

  it("only points at other valid enum members", () => {
    for (const targets of Object.values(MERCHANT_VERIFICATION_TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it.each([
    ["DRAFT", "SUBMITTED", true],
    ["DRAFT", "APPROVED", false],
    ["SUBMITTED", "APPROVED", true],
    ["SUBMITTED", "REJECTED", true],
    ["SUBMITTED", "UNDER_REVIEW", true],
    ["UNDER_REVIEW", "APPROVED", true],
    ["UNDER_REVIEW", "REJECTED", true],
    ["APPROVED", "SUSPENDED", true],
    ["APPROVED", "REJECTED", false],
    ["REJECTED", "SUBMITTED", false],
    ["SUSPENDED", "APPROVED", false],
  ])("%s -> %s is %s", (from, to, expected) => {
    expect(
      isMerchantVerificationTransitionAllowed(
        from as MerchantVerificationStatus,
        to as MerchantVerificationStatus,
      ),
    ).toBe(expected);
  });

  describe("allowedFromStatusesFor", () => {
    it("derives the approve guard's WHERE-clause list", () => {
      expect(allowedFromStatusesFor("APPROVED").sort()).toEqual(
        ["SUBMITTED", "UNDER_REVIEW"].sort(),
      );
    });

    it("derives the reject guard's WHERE-clause list", () => {
      expect(allowedFromStatusesFor("REJECTED").sort()).toEqual(
        ["SUBMITTED", "UNDER_REVIEW"].sort(),
      );
    });

    it("derives the suspend guard's WHERE-clause list (APPROVED only)", () => {
      expect(allowedFromStatusesFor("SUSPENDED")).toEqual(["APPROVED"]);
    });

    it("derives the submit guard's WHERE-clause list (DRAFT only)", () => {
      expect(allowedFromStatusesFor("SUBMITTED")).toEqual(["DRAFT"]);
    });

    it("returns an empty list for a status nothing transitions into", () => {
      expect(allowedFromStatusesFor("DRAFT")).toEqual([]);
    });
  });
});
