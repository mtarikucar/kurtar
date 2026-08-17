import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KurtarApiError } from "@kurtar/api-client";
import { client } from "../lib/api-client";

export const RESERVATIONS_QUERY_KEY = ["reservations", "mine"] as const;

/**
 * `GET /reservations/mine`'s `page`/`pageSize` are declared REQUIRED by the
 * committed contract (docs/openapi.json), even though the backend DTO
 * gives them runtime defaults of 1/20 — matching the contract as declared,
 * not the DTO's runtime leniency (same convention as
 * packages/api-client/src/domains/ratings.ts's own doc comment). This app
 * has no pagination UI for "my reservations" (Orders/Siparişler shows the
 * whole list at once), so this fetches one page sized to the DTO's own
 * @Max(50) ceiling (backend/src/modules/reservations/dto/
 * list-reservations-query.dto.ts) rather than truncating a real consumer's
 * history. Exported so every screen that needs "my reservations" (orders,
 * payment polling, redeem reconciliation, the global redeem sync) shares
 * the exact same query — one shape, one cache entry, one place to change
 * the page size if this ever needs real pagination.
 */
export function fetchMyReservations() {
  return client.reservations.listMine({ page: 1, pageSize: 50 });
}

/**
 * Orders (Siparişler) must stay readable offline (brief §"Offline") — the
 * default queryClient options already keep the last-fetched page around
 * via gcTime and never blank the screen on a transient failure (see
 * ErrorState usage in the orders screen, which only replaces content when
 * there is truly no cached data yet).
 */
export function useReservations() {
  return useQuery({
    queryKey: RESERVATIONS_QUERY_KEY,
    queryFn: fetchMyReservations,
    staleTime: 15_000,
  });
}

export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ offerId, qty }: { offerId: string; qty: number }) =>
      client.reservations.create({ offerId, qty }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RESERVATIONS_QUERY_KEY });
    },
  });
}

/** True specifically for the "someone else bought the last bag" race the
 * brief calls out as common, not exceptional, at drop time. */
export function isOfferUnavailableError(err: unknown): boolean {
  return err instanceof KurtarApiError && err.errorCode === "OFFER_UNAVAILABLE";
}

export function useCancelReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reservationId: string) =>
      client.reservations.cancel(reservationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RESERVATIONS_QUERY_KEY });
    },
  });
}

export function useRateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reservationId,
      overallStars,
      foodQuality,
      service,
      comment,
    }: {
      reservationId: string;
      overallStars: number;
      foodQuality?: number;
      service?: number;
      comment?: string;
    }) =>
      client.reservations.rate(reservationId, {
        overallStars,
        foodQuality,
        service,
        comment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RESERVATIONS_QUERY_KEY });
    },
  });
}
