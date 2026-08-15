import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../api/client";
import { castAdminResponse } from "../../api/admin-types";
import type {
  AdminRatingListResponse,
  ModerationStatus,
  Rating,
} from "../../api/admin-types";

export type RatingStatusFilter = ModerationStatus | "ALL";

export function useRatingsList(
  filter: RatingStatusFilter,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: ["admin", "ratings", filter, page, pageSize],
    queryFn: async (): Promise<AdminRatingListResponse> => {
      const res = await client.admin.ratings.list({
        status: filter === "ALL" ? undefined : filter,
        page,
        pageSize,
      });
      return castAdminResponse<AdminRatingListResponse>(res);
    },
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
    mutationFn: (id: string) =>
      client.admin.ratings
        .approve(id)
        .then((res) => castAdminResponse<Rating>(res)),
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
    mutationFn: (id: string) =>
      client.admin.ratings
        .reject(id, undefined)
        .then((res) => castAdminResponse<Rating>(res)),
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
