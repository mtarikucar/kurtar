import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../api/client";
import { asResponse } from "../api/response-types";
import type {
  DailyOffer,
  OfferMineItem,
  OfferPublishResponse,
  OfferScheduleResponse,
} from "../api/response-types";
import { offersForDateKey } from "../shared/entityQueries";
import { istanbulDateKey } from "../shared/format";

/**
 * `client.offers.listMine()` (packages/api-client/src/domains/offers.ts)
 * never forwards a `date` query parameter to the request, even though the
 * backend operation accepts one and defaults to TODAY when it's absent
 * (backend/src/modules/offers/offers.service.ts's `listMine`: `date ??
 * istanbulDateKey(new Date())`). That means this call can only ever return
 * TODAY's offers, no matter which day is actually wanted — a confirmed
 * api-client gap (flagged in this task's report; see that report for the
 * other three of the same shape). Per docs/frontend-contract.md §2, this is
 * NOT worked around with a hand-rolled fetch call here — the week view
 * below only ever shows REAL per-offer data for today's cell as a result;
 * other days can still have offers CREATED (POST /offers takes `offerDate`
 * in its body, unaffected by this gap) but not LISTED through this screen.
 */
export function useTodayOffersForWeek() {
  const dateKey = istanbulDateKey();
  return useQuery({
    queryKey: offersForDateKey(dateKey),
    queryFn: async () =>
      asResponse<OfferMineItem[]>(await client.offers.listMine()),
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
      const offer = asResponse<DailyOffer>(await client.offers.create(input));
      const published = asResponse<OfferPublishResponse>(
        await client.offers.publish(offer.id),
      );
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
      const offer = asResponse<DailyOffer>(await client.offers.create(input));
      const scheduled = asResponse<OfferScheduleResponse>(
        await client.offers.schedule(offer.id, { publishAt }),
      );
      return { offer, scheduled };
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: offersForDateKey(variables.offerDate),
      });
    },
  });
}
