import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { client } from "../lib/api-client";
import { RESERVATIONS_QUERY_KEY } from "./use-reservations";
import { clearQueuedConfirmation, getAllQueuedConfirmations } from "../lib/redeem-queue";
import type { ReservationListResponse } from "../lib/api-types";

const FOREGROUND_SYNC_INTERVAL_MS = 20_000;

/**
 * Mounted once at the app root — a merchant's till queue is exactly where
 * signal dies (brief), so a queued swipe confirmation (redeem-queue.ts)
 * must keep trying to reconcile even if the customer backs out of the
 * redeem screen while waiting for a signal bar. Best-effort only: this is
 * a foreground poll (app open, on an interval, and on every
 * foreground transition), not a true OS-level background task — a
 * managed Expo app has no reliable background-execution guarantee for
 * "poll every N seconds while the app is closed", and the redeem ceremony
 * is inherently screen-open-in-front-of-staff anyway (use-redeem-
 * reconciliation.ts's tighter poll covers that case). This hook only
 * covers "customer closed the redeem screen but kept the app open/
 * foregrounded" and "customer reopens the app later" — both real,
 * both cheap to cover without native background-task config.
 */
export function useGlobalRedeemSync(enabled: boolean) {
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    async function reconcileOnce() {
      const pending = await getAllQueuedConfirmations();
      if (pending.length === 0) return;
      try {
        const result = (await client.reservations.listMine()) as unknown as ReservationListResponse;
        queryClient.setQueryData(RESERVATIONS_QUERY_KEY, result);
        for (const entry of pending) {
          const match = result.items.find((r) => r.id === entry.reservationId);
          if (match?.status === "REDEEMED") {
            await clearQueuedConfirmation(entry.reservationId);
          }
        }
      } catch {
        // Still offline/unreachable — leave the queue as-is, try again
        // on the next tick or foreground transition.
      }
    }

    reconcileOnce();
    intervalRef.current = setInterval(reconcileOnce, FOREGROUND_SYNC_INTERVAL_MS);

    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") reconcileOnce();
      },
    );

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, [enabled, queryClient]);
}
