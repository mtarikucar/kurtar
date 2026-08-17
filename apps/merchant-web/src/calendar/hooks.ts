import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../api/client";
import { offersForDateKey } from "../shared/entityQueries";
import { istanbulDateKey } from "../shared/format";

/**
 * `client.offers.listMine()` (packages/api-client/src/domains/offers.ts)
 * DOES forward an optional `date` query param today (the api-client fix
 * that resolved the compiled `Promise<never>` bug also fixed query
 * parameters silently being dropped — see packages/api-client's
 * core-types.ts/engine.ts) — but this hook still never passes one, so it
 * can only ever return TODAY's offers no matter which day is actually
 * selected in the week view below. That's now an app-level gap in this
 * hook, not an api-client one; flagged in this task's report as a
 * follow-up rather than fixed here (out of scope for a cast-removal pass:
 * wiring a per-day `date` through this hook and CalendarPage's week strip
 * is a small feature change, not a type fix). Per docs/frontend-contract.md
 * §2, this is NOT worked around with a hand-rolled fetch call here — the
 * week view below only ever shows REAL per-offer data for today's cell as
 * a result; other days can still have offers CREATED (POST /offers takes
 * `offerDate` in its body, unaffected by this gap) but not LISTED through
 * this screen.
 */
export function useTodayOffersForWeek() {
  const dateKey = istanbulDateKey();
  return useQuery({
    queryKey: offersForDateKey(dateKey),
    queryFn: async () => client.offers.listMine(),
    staleTime: 15_000,
  });
}

export interface CreateOfferInput {
  bagTemplateId: string;
  offerDate: string;
  qtyTotal: number;
  pickupStartAt: string;
  pickupEndAt: string;
}

export function useCreateAndPublishOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOfferInput) => {
      const offer = await client.offers.create(input);
      const published = await client.offers.publish(offer.id);
      return { offer, published };
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: offersForDateKey(variables.offerDate),
      });
    },
  });
}

export function useCreateAndScheduleOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      publishAt,
      ...input
    }: CreateOfferInput & { publishAt: string }) => {
      const offer = await client.offers.create(input);
      const scheduled = await client.offers.schedule(offer.id, { publishAt });
      return { offer, scheduled };
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: offersForDateKey(variables.offerDate),
      });
    },
  });
}
