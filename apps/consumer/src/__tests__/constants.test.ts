import * as fs from "node:fs";
import * as path from "node:path";
import { CANCEL_DEADLINE_BEFORE_PICKUP_MS } from "../lib/constants";

/**
 * [M13 fix] `CANCEL_DEADLINE_BEFORE_PICKUP_MS` hand-mirrors a backend
 * constant with nothing tying the two together (see constants.ts's own
 * doc comment): re-read the real backend constant from source and fail
 * loudly the moment it drifts from this app's mirrored copy.
 *
 * [Cross-lane fix, I9] The stakes changed but the guard still earns its
 * keep. This app no longer DERIVES any pickup time from the constant —
 * `ReservationDto` now carries the real `pickupStartAt`/`pickupEndAt`, so
 * a drift can no longer mis-place every pickup time in the app. What it
 * can still do is make the free-cancellation sentence the customer reads
 * ("2 saat öncesine kadar") disagree with the deadline the server
 * actually enforces, which is the reason this test remains.
 */
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const BACKEND_SOURCE = path.join(
  REPO_ROOT,
  "backend/src/modules/reservations/reservations.service.ts",
);

describe("CANCEL_DEADLINE_BEFORE_PICKUP_MS mirrors the real backend constant (M13)", () => {
  it("matches reservations.service.ts's own CANCEL_DEADLINE_BEFORE_PICKUP_MS exactly", () => {
    const source = fs.readFileSync(BACKEND_SOURCE, "utf8");
    const match = source.match(
      /const CANCEL_DEADLINE_BEFORE_PICKUP_MS\s*=\s*([^;]+);/,
    );
    if (!match) {
      throw new Error(
        "Could not find CANCEL_DEADLINE_BEFORE_PICKUP_MS in reservations.service.ts — " +
          "either the constant was renamed/removed, or this test's regex needs updating. " +
          "Either way, this app's mirrored copy (lib/constants.ts) needs to move with it.",
      );
    }
    // Evaluates a plain numeric expression (e.g. "2 * 60 * 60 * 1000")
    // read straight out of trusted first-party source, not user input.
    const backendValueMs = eval(match[1]) as number;
    expect(CANCEL_DEADLINE_BEFORE_PICKUP_MS).toBe(backendValueMs);
  });
});
