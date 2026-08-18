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

/**
 * [M20 fix] Redeem-by-id — was also wired to a "Manuel teslim" typed-input
 * fallback that asked the merchant for a "Rezervasyon kimliği" (the
 * reservation's internal id), a value no surface in this app ever shows
 * them (only the 6-char `code` is rendered anywhere), so it could only
 * ever be used by pasting an id out of a network tab. That fallback is
 * gone — GET /reservations/for-merchant already returns every one of
 * today's reservations across every store, and the per-row button below
 * covers all of them with no typed input needed. Kept as its own hook
 * (rather than inlined) since PickupListSection is already the only
 * caller and a named mutation reads better at the call site.
 */
export function useRedeemReservation() {
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
