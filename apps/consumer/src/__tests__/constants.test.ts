import * as fs from "node:fs";
import * as path from "node:path";
import { CANCEL_DEADLINE_BEFORE_PICKUP_MS, derivePickupStartAt } from "../lib/constants";

/**
 * [M13 fix] `CANCEL_DEADLINE_BEFORE_PICKUP_MS` hand-mirrors a backend
 * constant with nothing tying the two together (see constants.ts's own
 * doc comment) — `GET /reservations/mine`'s `ReservationDto` still has no
 * `pickupStartAt`/`pickupEndAt` field (only `ReservationForMerchantItemDto`
 * does — backend/src/modules/reservations/dto/reservation-response.dto.ts),
 * so this app derives the pickup window's start from `cancelDeadlineAt`
 * alone. Adding the real fields to `ReservationDto` is a backend change
 * out of scope for this fix. This is the "cheaper stopgap" the finding
 * itself proposes: re-read the real backend constant from source and fail
 * loudly the moment it drifts from this app's mirrored copy, instead of
 * silently mis-deriving every pickup time in the app.
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

  it("derivePickupStartAt adds exactly that duration back onto cancelDeadlineAt", () => {
    const cancelDeadlineAt = "2026-08-15T16:30:00.000Z";
    const derived = derivePickupStartAt(cancelDeadlineAt);
    expect(derived.getTime() - new Date(cancelDeadlineAt).getTime()).toBe(
      CANCEL_DEADLINE_BEFORE_PICKUP_MS,
    );
  });
});
