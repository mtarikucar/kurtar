import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KurtarApiError } from "@kurtar/api-client";
import { client } from "../lib/api-client";
import type {
  RatingResult,
  ReservationCancelResponse,
  ReservationCreateResponse,
  ReservationListResponse,
} from "../lib/api-types";

export const RESERVATIONS_QUERY_KEY = ["reservations", "mine"] as const;

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
    queryFn: async () =>
      (await client.reservations.listMine()) as unknown as ReservationListResponse,
    staleTime: 15_000,
  });
}

export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ offerId, qty }: { offerId: string; qty: number }) =>
      (await client.reservations.create({
        offerId,
        qty,
      })) as unknown as ReservationCreateResponse,
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
      (await client.reservations.cancel(
        reservationId,
      )) as unknown as ReservationCancelResponse,
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
      (await client.reservations.rate(reservationId, {
        overallStars,
        foodQuality,
        service,
        comment,
      })) as unknown as RatingResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RESERVATIONS_QUERY_KEY });
    },
  });
}
