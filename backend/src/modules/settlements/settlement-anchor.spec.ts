import {
  compareBySettlementAnchor,
  SettlementAnchored,
  settlementAnchorOf,
} from "./settlement-batch-builder.service";
import { istanbulDateKey } from "../../common/utils/istanbul-date.util";

/**
 * The eligibility scan's ordering/grouping key, pinned deterministically.
 *
 * This is a unit spec on purpose. The real-DB scenario in
 * settlements.realdb.spec.ts ("[q]") proves the END-TO-END consequence (a
 * merchant's membership balance draws down oldest day first when the
 * oldest day is a no-show), but it cannot prove the ORDERING itself: a
 * query with no ORDER BY is free to return rows in the right order by
 * accident, and on a small fixture it usually does. Only a pure function
 * with a hand-built input can say "reversed input, still chronological
 * output" and mean it.
 */
function reservation(
  over: Partial<SettlementAnchored> & { id: string },
): SettlementAnchored {
  return {
    status: "REDEEMED",
    redeemedAt: null,
    offer: { pickupEndAt: new Date("2026-08-01T12:00:00.000Z") },
    ...over,
  };
}

describe("settlementAnchorOf", () => {
  it("anchors a REDEEMED bag at its redemption", () => {
    expect(
      settlementAnchorOf(
        reservation({
          id: "r1",
          status: "REDEEMED",
          redeemedAt: new Date("2026-08-01T11:12:13.000Z"),
        }),
      ),
    ).toEqual(new Date("2026-08-01T11:12:13.000Z"));
  });

  it("anchors a NO_SHOW bag at the moment its pickup window closed, not at the sweep", () => {
    expect(
      settlementAnchorOf(
        reservation({
          id: "r2",
          status: "NO_SHOW",
          redeemedAt: null,
          offer: { pickupEndAt: new Date("2026-08-01T20:59:00.000Z") },
        }),
      ),
    ).toEqual(new Date("2026-08-01T20:59:00.000Z"));
  });

  it("puts a no-show on the SAME Istanbul settlement day as a bag redeemed from the same window", () => {
    // 20:30 UTC is 23:30 Istanbul — the latest kind of window
    // offer-window.rules.ts permits, and the case where anchoring on the
    // sweep instant (which would run after midnight, in the grace period)
    // would silently bill the merchant's bag to the WRONG day and push its
    // 5-business-day payout deadline back with it.
    const window = { pickupEndAt: new Date("2026-08-01T20:59:00.000Z") };
    const collected = reservation({
      id: "r3",
      status: "REDEEMED",
      redeemedAt: new Date("2026-08-01T20:58:00.000Z"),
      offer: window,
    });
    const uncollected = reservation({
      id: "r4",
      status: "NO_SHOW",
      redeemedAt: null,
      offer: window,
    });
    expect(istanbulDateKey(settlementAnchorOf(uncollected))).toBe(
      istanbulDateKey(settlementAnchorOf(collected)),
    );
    expect(istanbulDateKey(settlementAnchorOf(uncollected))).toBe("2026-08-01");
  });
});

describe("compareBySettlementAnchor", () => {
  it("orders a MIXED redeemed/no-show population oldest-earning-first regardless of input order", () => {
    const day1NoShow = reservation({
      id: "z-no-show-day-1",
      status: "NO_SHOW",
      redeemedAt: null,
      offer: { pickupEndAt: new Date("2026-08-10T12:00:00.000Z") },
    });
    const day2Redeemed = reservation({
      id: "a-redeemed-day-2",
      status: "REDEEMED",
      redeemedAt: new Date("2026-08-11T11:00:00.000Z"),
      offer: { pickupEndAt: new Date("2026-08-11T12:00:00.000Z") },
    });
    const day3NoShow = reservation({
      id: "m-no-show-day-3",
      status: "NO_SHOW",
      redeemedAt: null,
      offer: { pickupEndAt: new Date("2026-08-12T12:00:00.000Z") },
    });

    // Deliberately reversed, and with ids that sort the OTHER way — so a
    // comparator that fell back on id, or one that read `redeemedAt`
    // alone (null for both no-shows), could not produce this answer.
    const sorted = [day3NoShow, day2Redeemed, day1NoShow]
      .slice()
      .sort(compareBySettlementAnchor)
      .map((r) => r.id);

    expect(sorted).toEqual([
      "z-no-show-day-1",
      "a-redeemed-day-2",
      "m-no-show-day-3",
    ]);
  });

  it("breaks a same-instant tie on id, so the order is deterministic rather than arbitrary", () => {
    const at = new Date("2026-08-01T11:00:00.000Z");
    const b = reservation({ id: "b", status: "REDEEMED", redeemedAt: at });
    const a = reservation({ id: "a", status: "REDEEMED", redeemedAt: at });
    expect([b, a].sort(compareBySettlementAnchor).map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
    expect(compareBySettlementAnchor(a, a)).toBe(0);
  });
});
