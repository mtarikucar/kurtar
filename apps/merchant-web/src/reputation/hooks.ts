import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../api/client";
import { useAuth } from "../auth/AuthContext";

/**
 * `client.ratings.listMine()` (packages/api-client/src/domains/ratings.ts)
 * requires `{ storeId, page, pageSize }` — `GET /api/ratings/mine`
 * (backend/src/modules/ratings/dto/ratings-mine-query.dto.ts) has no
 * default for `storeId`, since ratings are always scoped to one store.
 * This screen has no store-selector UI (out of scope here — this is a
 * plumbing fix, not a multi-store feature), so it follows the same "the
 * merchant's store" convention already used by
 * stores/BagTemplateForm.tsx (`stores[0]?.id`): the first store off the
 * signed-in merchant's own profile. A brand-new merchant with zero stores
 * yet has no id to query with, so the query stays disabled
 * (`enabled: !!storeId`) until one exists — see RatingsPanel's own
 * isPending check for how that's kept from spinning forever.
 */
export function useRatings() {
  const { merchant } = useAuth();
  const storeId = merchant?.stores[0]?.id;
  return useQuery({
    queryKey: ["ratings", "mine", storeId ?? null],
    queryFn: async () =>
      client.ratings.listMine({
        storeId: storeId as string,
        page: 1,
        pageSize: 20,
      }),
    enabled: Boolean(storeId),
    retry: false,
  });
}

export function useAssignedComplaints() {
  return useQuery({
    queryKey: ["complaints", "assigned"],
    queryFn: async () => client.complaints.listAssigned(),
    staleTime: 15_000,
  });
}

export function useComplaintDetail(id: string | null) {
  return useQuery({
    queryKey: ["complaints", "detail", id],
    // [I18 fix] `client.complaints.get` is the CONSUMER-only GET
    // /complaints/:id (class-level @Actors("CONSUMER") on
    // ComplaintsController) — every merchant call there 403'd, so the
    // reply thread never rendered. `getAssigned` hits the merchant-scoped
    // mirror, GET /complaints/assigned/:id.
    queryFn: async () => client.complaints.getAssigned(id as string),
    enabled: id !== null,
  });
}

export function useReplyToComplaint(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) =>
      client.complaints.addMessage(id, { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["complaints", "detail", id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["complaints", "assigned"],
      });
    },
  });
}
