import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/api-client";
import { RESERVATIONS_QUERY_KEY } from "./use-reservations";
import type { ReservationListResponse } from "../lib/api-types";
import {
  clearQueuedConfirmation,
  getQueuedConfirmation,
  queueLocalConfirmation,
  type QueuedRedeemConfirmation,
} from "../lib/redeem-queue";

const POLL_INTERVAL_MS = 4000;

/**
 * The redeem screen's state machine (see src/app/redeem/[id].tsx for the
 * screen itself, redeem-queue.ts for why a CONSUMER-side "confirm" can
 * only ever be a locally-queued swipe, never the actual
 * `POST /reservations/:id/redeem` call):
 *
 *   idle -> (swipe) -> queued, not yet reconciled -> [poll GET /reservations/mine]
 *     -> reconciled (status flipped to REDEEMED, presumably by staff
 *        scanning/keying the code on their own device while looking at
 *        this screen's live clock) -> queue entry cleared.
 *
 * While queued and unreconciled, `isOffline` distinguishes "still waiting
 * for staff to act" (poll succeeds, status just isn't REDEEMED yet) from
 * "we can't even reach the server right now" (poll itself is failing) —
 * only the latter drives the screen's orange "çevrimdışı onaylandı"
 * treatment; the former is the calmer "waiting for staff" state.
 */
export function useRedeemReconciliation(reservationId: string) {
  const [queued, setQueued] = useState<QueuedRedeemConfirmation | null>(null);
  const [queueChecked, setQueueChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getQueuedConfirmation(reservationId).then((entry) => {
      if (cancelled) return;
      setQueued(entry);
      setQueueChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [reservationId]);

  const confirm = useCallback(async () => {
    const entry = await queueLocalConfirmation(reservationId);
    setQueued(entry);
  }, [reservationId]);

  const reservationsQuery = useQuery({
    queryKey: RESERVATIONS_QUERY_KEY,
    queryFn: async () =>
      (await client.reservations.listMine()) as unknown as ReservationListResponse,
    enabled: queued !== null,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const mine = items.find((r) => r.id === reservationId);
      return mine?.status === "REDEEMED" ? false : POLL_INTERVAL_MS;
    },
  });

  const mine =
    reservationsQuery.data?.items.find((r) => r.id === reservationId) ?? null;
  const reconciled = mine?.status === "REDEEMED";

  useEffect(() => {
    if (reconciled) {
      clearQueuedConfirmation(reservationId).catch(() => undefined);
    }
  }, [reconciled, reservationId]);

  // "Offline" only once we've actually tried and failed to reach the
  // server at least once since swiping — not on the very first render
  // before the first poll has had a chance to run.
  const isOffline =
    queued !== null &&
    !reconciled &&
    reservationsQuery.isError &&
    reservationsQuery.errorUpdateCount > 0;

  return {
    queued,
    queueChecked,
    confirm,
    reconciled,
    redeemedAt: mine?.redeemedAt ?? null,
    isOffline,
    isPolling: reservationsQuery.isFetching,
  };
}
