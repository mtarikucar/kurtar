import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../lib/api-client";
import type { FavoriteListResponse } from "../lib/api-types";

export function useFavorites() {
  return useQuery({
    queryKey: ["favorites", "mine"],
    queryFn: async () =>
      (await client.favorites.listMine()) as FavoriteListResponse,
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
