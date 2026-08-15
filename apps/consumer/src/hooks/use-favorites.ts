import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../lib/api-client";

/**
 * `GET /me/favorites`'s `page`/`pageSize` are declared REQUIRED by the
 * committed contract even though the DTO defaults them at runtime (same
 * convention as `fetchMyReservations` in use-reservations.ts). No
 * pagination UI exists for favorites yet, so this fetches one page sized
 * to the DTO's own @Max(100) ceiling
 * (backend/src/modules/favorites/dto/list-favorites-query.dto.ts).
 */
export function useFavorites() {
  return useQuery({
    queryKey: ["favorites", "mine"],
    queryFn: async () =>
      client.favorites.listMine({ page: 1, pageSize: 100 }),
    staleTime: 30_000,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      storeId,
      isFavorite,
    }: {
      storeId: string;
      isFavorite: boolean;
    }) => {
      if (isFavorite) {
        await client.favorites.remove(storeId);
      } else {
        await client.favorites.add(storeId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites", "mine"] });
    },
  });
}
