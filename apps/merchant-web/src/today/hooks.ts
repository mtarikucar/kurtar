import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../api/client";
import { offersForDateKey } from "../shared/entityQueries";
import { istanbulDateKey } from "../shared/format";

export function useTodayOffers() {
  const dateKey = istanbulDateKey();
  return useQuery({
    queryKey: offersForDateKey(dateKey),
    queryFn: async () => client.offers.listMine(),
    staleTime: 15_000,
  });
}

/**
 * GET /reservations/for-merchant — today's pickup list (every status,
 * every one of the caller's stores, by default). Added once the backend
 * gap PickupListSection.tsx's own doc comment describes ("no endpoint
 * returns this") was closed — see that component for the fallback path
 * this complements rather than replaces.
 */
export function usePickupList() {
  return useQuery({
    queryKey: ["reservations", "for-merchant", istanbulDateKey()],
    queryFn: async () => client.reservations.listForMerchant(),
    staleTime: 10_000,
    refetchInterval: 30_000,
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
      const offer = await client.offers.create(input);
      const published = await client.offers.publish(offer.id);
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
    mutationFn: async (offerId: string) => client.offers.close(offerId),
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
    mutationFn: async (offerId: string) => client.offers.cancel(offerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: offersForDateKey(istanbulDateKey()),
      });
    },
  });
}

/** Redeem-by-id — used both by the real pickup list's per-row button and
 * the manual "teslim edildi" fallback (see PickupListSection's own doc
 * comment for why the fallback takes a reservation ID rather than a
 * code). */
export function useManualRedeem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reservationId: string) =>
      client.reservations.redeem(reservationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["reservations", "for-merchant"],
      });
    },
  });
}
