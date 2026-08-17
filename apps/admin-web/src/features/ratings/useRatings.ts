import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../api/client";
import type { ModerationStatus } from "../../api/admin-types";

export type RatingStatusFilter = ModerationStatus | "ALL";

export function useRatingsList(
  filter: RatingStatusFilter,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: ["admin", "ratings", filter, page, pageSize],
    queryFn: () =>
      client.admin.ratings.list({
        status: filter === "ALL" ? undefined : filter,
        page,
        pageSize,
      }),
  });
}

function useInvalidateRatings() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "ratings"] });
}

export function useApproveRating() {
  const invalidate = useInvalidateRatings();
  return useMutation({
    mutationFn: (id: string) => client.admin.ratings.approve(id),
    onSuccess: invalidate,
  });
}

export function useRejectRating() {
  const invalidate = useInvalidateRatings();
  return useMutation({
    // The generated client's `reject` requires a second (body) argument
    // where `approve`/`remove` don't — an artifact of how
    // AdminRatingsController_reject's empty `requestBody` is encoded
    // (`RequestBody<...>` resolves to `unknown`, not `never`, here) rather
    // than a real body the backend reads. `undefined` satisfies the type;
    // no field is actually sent.
    mutationFn: (id: string) => client.admin.ratings.reject(id, undefined),
    onSuccess: invalidate,
  });
}

export function useRemoveRating() {
  const invalidate = useInvalidateRatings();
  return useMutation({
    mutationFn: (id: string) => client.admin.ratings.remove(id),
    onSuccess: invalidate,
  });
}
