import { BadRequestException } from "@nestjs/common";
import { validateOfferWindow } from "./offer-window.rules";

// istanbulDateKey/offerDateToDbDate are re-exported from
// common/utils/istanbul-date.util.ts and covered by that file's own spec —
// not duplicated here.

const NOW = new Date("2026-08-12T12:00:00.000Z");

function errorCodeOf(fn: () => void): string {
  try {
    fn();
    throw new Error("expected to throw");
  } catch (err) {
    if (err instanceof BadRequestException) {
      return (err.getResponse() as { errorCode: string }).errorCode;
    }
    throw err;
  }
}

describe("validateOfferWindow", () => {
  function validInput() {
    return {
      offerDate: "2026-08-14",
      pickupStartAt: new Date("2026-08-14T17:00:00.000Z"), // 20:00 Istanbul
      pickupEndAt: new Date("2026-08-14T19:00:00.000Z"), // 22:00 Istanbul
    };
  }

  it("accepts a well-formed same-day future window", () => {
    expect(() => validateOfferWindow(validInput(), NOW)).not.toThrow();
  });

  it("rejects a malformed offerDate", () => {
    expect(
      errorCodeOf(() =>
        validateOfferWindow({ ...validInput(), offerDate: "14-08-2026" }, NOW),
      ),
    ).toBe("OFFER_DATE_INVALID");
  });

  it("rejects pickupEndAt <= pickupStartAt", () => {
    const input = validInput();
    expect(
      errorCodeOf(() =>
        validateOfferWindow(
          { ...input, pickupEndAt: input.pickupStartAt },
          NOW,
        ),
      ),
    ).toBe("OFFER_WINDOW_START_NOT_BEFORE_END");
  });

  it("rejects a window that has already started", () => {
    expect(
      errorCodeOf(() =>
        validateOfferWindow(
          {
            offerDate: "2026-08-12",
            pickupStartAt: new Date("2026-08-12T11:00:00.000Z"),
            pickupEndAt: new Date("2026-08-12T13:00:00.000Z"),
          },
          NOW,
        ),
      ),
    ).toBe("OFFER_WINDOW_NOT_FUTURE");
  });

  it("rejects a window on a different Istanbul calendar day than offerDate", () => {
    // pickupStartAt is 21:30 UTC on the 13th = 00:30 Istanbul on the 14th,
    // but offerDate claims the 13th.
    expect(
      errorCodeOf(() =>
        validateOfferWindow(
          {
            offerDate: "2026-08-13",
            pickupStartAt: new Date("2026-08-13T21:30:00.000Z"),
            pickupEndAt: new Date("2026-08-13T22:30:00.000Z"),
          },
          NOW,
        ),
      ),
    ).toBe("OFFER_WINDOW_NOT_SAME_DAY");
  });

  it("accepts that same near-midnight window when offerDate is correctly the NEXT Istanbul day", () => {
    expect(() =>
      validateOfferWindow(
        {
          offerDate: "2026-08-14",
          pickupStartAt: new Date("2026-08-13T21:30:00.000Z"),
          pickupEndAt: new Date("2026-08-13T22:30:00.000Z"),
        },
        NOW,
      ),
    ).not.toThrow();
  });

  it("rejects when only pickupEndAt spills onto the next Istanbul day", () => {
    expect(
      errorCodeOf(() =>
        validateOfferWindow(
          {
            offerDate: "2026-08-14",
            pickupStartAt: new Date("2026-08-14T18:00:00.000Z"), // 21:00 Istanbul, 14th
            pickupEndAt: new Date("2026-08-14T21:30:00.000Z"), // 00:30 Istanbul, 15th
          },
          NOW,
        ),
      ),
    ).toBe("OFFER_WINDOW_NOT_SAME_DAY");
  });
});
