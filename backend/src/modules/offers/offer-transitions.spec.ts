import { OfferStatus } from "@prisma/client";
import {
  allowedFromStatusesFor,
  isOfferTransitionAllowed,
  OFFER_TRANSITIONS,
} from "./offer-transitions";

const ALL_STATUSES: OfferStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "SOLD_OUT",
  "CLOSED",
  "CANCELLED",
];

describe("OFFER_TRANSITIONS", () => {
  it("covers every enum member as a key", () => {
    expect(Object.keys(OFFER_TRANSITIONS).sort()).toEqual(
      [...ALL_STATUSES].sort(),
    );
  });

  it("only points at other valid enum members", () => {
    for (const targets of Object.values(OFFER_TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it.each([
    ["DRAFT", "SCHEDULED", true],
    ["DRAFT", "PUBLISHED", true],
    ["DRAFT", "CANCELLED", true],
    ["DRAFT", "CLOSED", false],
    ["SCHEDULED", "PUBLISHED", true],
    ["SCHEDULED", "CANCELLED", true],
    ["SCHEDULED", "CLOSED", false],
    ["PUBLISHED", "CLOSED", true],
    ["PUBLISHED", "CANCELLED", true],
    ["PUBLISHED", "SOLD_OUT", false],
    ["SOLD_OUT", "CLOSED", true],
    ["SOLD_OUT", "CANCELLED", true],
    ["SOLD_OUT", "PUBLISHED", false],
    ["CLOSED", "CANCELLED", false],
    ["CANCELLED", "PUBLISHED", false],
  ])("%s -> %s is %s", (from, to, expected) => {
    expect(
      isOfferTransitionAllowed(from as OfferStatus, to as OfferStatus),
    ).toBe(expected);
  });

  describe("allowedFromStatusesFor", () => {
    it("derives the publish guard's WHERE-clause list", () => {
      expect(allowedFromStatusesFor("PUBLISHED").sort()).toEqual(
        ["DRAFT", "SCHEDULED"].sort(),
      );
    });

    it("derives the schedule guard's WHERE-clause list", () => {
      expect(allowedFromStatusesFor("SCHEDULED")).toEqual(["DRAFT"]);
    });

    it("derives the close guard's WHERE-clause list", () => {
      expect(allowedFromStatusesFor("CLOSED").sort()).toEqual(
        ["PUBLISHED", "SOLD_OUT"].sort(),
      );
    });

    it("derives the cancel guard's WHERE-clause list (every active status)", () => {
      expect(allowedFromStatusesFor("CANCELLED").sort()).toEqual(
        ["DRAFT", "SCHEDULED", "PUBLISHED", "SOLD_OUT"].sort(),
      );
    });

    it("returns an empty list for a status nothing transitions into", () => {
      expect(allowedFromStatusesFor("DRAFT")).toEqual([]);
    });
  });
});
