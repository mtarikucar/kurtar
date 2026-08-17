import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KurtarApiError } from "@kurtar/api-client";
import { client } from "../lib/api-client";
import { RESERVATIONS_QUERY_KEY, fetchMyReservations } from "./use-reservations";
import {
  clearQueuedConfirmation,
  getQueuedConfirmation,
  queueLocalConfirmation,
  type QueuedRedeemConfirmation,
} from "../lib/redeem-queue";

const POLL_INTERVAL_MS = 4000;

/**
 * The redeem screen's state machine (see src/app/redeem/[id].tsx for the
 * screen itself, redeem-queue.ts for the offline fallback's own doc
 * comment). `POST /reservations/:id/redeem` accepts the CONSUMER owner
 * directly now (a product fix landed after this screen was first built —
 * see reservations.controller.ts's `@Actors("CONSUMER", "MERCHANT")` and
 * reservations.service.ts's `redeem()` doc comment for the approved
 * design, plan §4.6: the phone swipe IS the redemption, not a request for
 * staff to redeem on their own device). So the PRIMARY path is now a real
 * network call, not a local queue:
 *
 *   idle -> (swipe) -> POST /reservations/:id/redeem
 *     -> success -> reconciled immediately (green), no polling needed
 *     -> rejected for a REAL reason (wrong pickup window, not yours, ...)
 *        -> surfaced as an error, nothing queued (queuing a rejection the
 *           server will keep rejecting forever would just hide it)
 *     -> the call never reached the server at all (`KurtarApiError.
 *        isNetworkError` — offline, DNS, timeout) -> FALLBACK: the swipe
 *        is queued locally and reconciliation falls back to polling
 *        `GET /reservations/mine` (the one consumer-reachable read, same
 *        one useGlobalRedeemSync uses in the background) until the
 *        reservation's status flips to REDEEMED — by staff acting on
 *        their side (a manual redeem from the merchant-web pickup list).
 *        There is deliberately no automatic retry of the direct call from
 *        here: once queued, this screen never re-renders `SwipeToConfirm`
 *        (see redeem/[id].tsx) and neither this hook nor
 *        useGlobalRedeemSync ever calls `client.reservations.redeem()`
 *        again — both only ever poll the read. A queued-and-still-offline
 *        reservation is a dead end for the consumer's own device; only
 *        staff redeeming it manually, or an engineer/admin intervening,
 *        moves it forward. See `docs/launch-checklist.md`'s deferred-minor
 *        items for this gap.
 *
 * While queued and unreconciled, `isOffline` distinguishes "still waiting"
 * (poll succeeds, status just isn't REDEEMED yet) from "we can't even
 * reach the server right now" (poll itself is failing) — only the latter
 * drives the screen's orange "çevrimdışı onaylandı" treatment.
 */
export function useRedeemReconciliation(reservationId: string) {
  const queryClient = useQueryClient();
  const [queued, setQueued] = useState<QueuedRedeemConfirmation | null>(null);
  const [queueChecked, setQueueChecked] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemedAtDirect, setRedeemedAtDirect] = useState<string | null>(null);

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

  /**
   * Called on swipe. Resolves normally for BOTH a real success and an
   * offline fallback (nothing left for the caller to do in either case —
   * the screen just re-renders off `reconciled`/`queued`); rejects only
   * for a genuine server-side refusal, which the caller is expected to
   * show to the user (see redeem/[id].tsx's own try/catch).
   */
  const confirm = useCallback(async () => {
    setRedeeming(true);
    try {
      const result = await client.reservations.redeem(reservationId);
      setRedeemedAtDirect(result.redeemedAt);
      await clearQueuedConfirmation(reservationId);
      void queryClient.invalidateQueries({ queryKey: RESERVATIONS_QUERY_KEY });
    } catch (err) {
      if (err instanceof KurtarApiError && err.isNetworkError) {
        const entry = await queueLocalConfirmation(reservationId);
        setQueued(entry);
        return;
      }
      throw err;
    } finally {
      setRedeeming(false);
    }
  }, [reservationId, queryClient]);

  const reservationsQuery = useQuery({
    queryKey: RESERVATIONS_QUERY_KEY,
    queryFn: fetchMyReservations,
    enabled: queued !== null && redeemedAtDirect === null,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const mine = items.find((r) => r.id === reservationId);
      return mine?.status === "REDEEMED" ? false : POLL_INTERVAL_MS;
    },
  });

  const mine =
    reservationsQuery.data?.items.find((r) => r.id === reservationId) ?? null;
  const reconciledViaPoll = mine?.status === "REDEEMED";
  const reconciled = redeemedAtDirect !== null || reconciledViaPoll;

  useEffect(() => {
    if (reconciledViaPoll) {
      clearQueuedConfirmation(reservationId).catch(() => undefined);
    }
  }, [reconciledViaPoll, reservationId]);

  // "Offline" only once we've actually tried and failed to reach the
  // server at least once since queuing — not on the very first render
  // before the first poll has had a chance to run, and never once a
  // direct success has already reconciled this reservation.
  const isOffline =
    queued !== null &&
    !reconciled &&
    reservationsQuery.isError &&
    reservationsQuery.errorUpdateCount > 0;

  return {
    queued,
    queueChecked,
    confirm,
    redeeming,
    reconciled,
    redeemedAt: redeemedAtDirect ?? mine?.redeemedAt ?? null,
    isOffline,
    isPolling: reservationsQuery.isFetching,
  };
}
