import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../api/client";
import { asResponse } from "../api/response-types";
import type {
  DailyOffer,
  OfferCancelResponse,
  OfferCloseResponse,
  OfferMineItem,
  OfferPublishResponse,
  ReservationRedeemResponse,
} from "../api/response-types";
import { offersForDateKey } from "../shared/entityQueries";
import { istanbulDateKey } from "../shared/format";

export function useTodayOffers() {
  const dateKey = istanbulDateKey();
  return useQuery({
    queryKey: offersForDateKey(dateKey),
    queryFn: async () =>
      asResponse<OfferMineItem[]>(await client.offers.listMine()),
    staleTime: 15_000,
  });
}

export interface QuickPublishInput {
  bagTemplateId: string;
  offerDate: string;
  qtyTotal: number;
  pickupStartAt: string;
  pickupEndAt: string;
}

/**
 * The one-tap publish action: create today's DailyOffer from a template,
 * then publish it immediately — two network calls behind one user tap
 * (see today/QuickPublishCard.tsx). Never optimistic: publish is a money-
 * adjacent, customer-visible action, so the UI waits for both calls to
 * really succeed before showing "live" (per the brief's "never optimistic
 * on money or publish actions").
 */
export function useQuickPublish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuickPublishInput) => {
      const offer = asResponse<DailyOffer>(await client.offers.create(input));
      const published = asResponse<OfferPublishResponse>(
        await client.offers.publish(offer.id),
      );
      return { offer, published };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: offersForDateKey(istanbulDateKey()),
      });
    },
  });
}

export function useCloseOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) =>
      asResponse<OfferCloseResponse>(await client.offers.close(offerId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: offersForDateKey(istanbulDateKey()),
      });
    },
  });
}

export function useCancelOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) =>
      asResponse<OfferCancelResponse>(await client.offers.cancel(offerId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: offersForDateKey(istanbulDateKey()),
      });
    },
  });
}

/** The manual "teslim edildi" fallback — see PickupListSection's own doc
 * comment for why this takes a reservation ID rather than a code. */
export function useManualRedeem() {
  return useMutation({
    mutationFn: async (reservationId: string) =>
      asResponse<ReservationRedeemResponse>(
        await client.reservations.redeem(reservationId),
      ),
  });
}
