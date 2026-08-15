import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../api/client";
import { asResponse } from "../api/response-types";
import type {
  ComplaintDetail,
  ComplaintListResponse,
  ComplaintMessage,
  RatingsMineResponse,
} from "../api/response-types";

/**
 * `client.ratings.listMine()` (packages/api-client/src/domains/ratings.ts)
 * takes NO parameters at all, but the backend operation it calls —
 * `GET /api/ratings/mine` (backend/src/modules/ratings/ratings.controller.ts)
 * — requires a `storeId` query parameter (`RatingsMineQueryDto.storeId`
 * has `@IsString()` with no `@IsOptional()`/default). There is no
 * supported way from this app to supply it: the domain wrapper's arrow
 * function ignores any argument passed to it, and the engine instance
 * itself isn't exposed on `KurtarClient`. This call will 400 at the
 * server every time until the domain wrapper is fixed to accept
 * `{ storeId, page?, pageSize? }` — a genuine, confirmed api-client bug
 * flagged in this task's report, NOT worked around here with a hand-rolled
 * fetch (see docs/frontend-contract.md §2's "don't patch around it in your
 * app" instruction). The screen below still renders the correct
 * loading/error/empty states for whenever this is fixed.
 */
export function useRatings() {
  return useQuery({
    queryKey: ["ratings", "mine"],
    queryFn: async () =>
      asResponse<RatingsMineResponse>(await client.ratings.listMine()),
    retry: false,
  });
}

export function useAssignedComplaints() {
  return useQuery({
    queryKey: ["complaints", "assigned"],
    queryFn: async () =>
      asResponse<ComplaintListResponse>(await client.complaints.listAssigned()),
    staleTime: 15_000,
  });
}

export function useComplaintDetail(id: string | null) {
  return useQuery({
    queryKey: ["complaints", "detail", id],
    queryFn: async () =>
      asResponse<ComplaintDetail>(await client.complaints.get(id as string)),
    enabled: id !== null,
  });
}

export function useReplyToComplaint(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) =>
      asResponse<ComplaintMessage>(
        await client.complaints.addMessage(id, { body }),
      ),
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
