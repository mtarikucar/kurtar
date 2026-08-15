import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/api-client";
import type {
  DiscoveryMapResponse,
  DiscoveryOffersResponse,
  DiscoveryStoreProfile,
} from "../lib/api-types";

export interface DiscoveryFilters {
  lat: number;
  lng: number;
  radiusM: number;
  category?: "MEAL" | "BAKERY" | "GROCERY" | "PRODUCE" | "OTHER";
  diet?: string;
  q?: string;
  pickupBefore?: string;
  pickupAfter?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Drop-time behavior (brief §"Cross-cutting"): offers publish 17:00-21:00
 * and sell out in minutes, so this needs a SHORT staleTime and a refetch
 * on focus/reconnect rather than the query-client's default — cached data
 * older than 20s is treated as stale the moment the discovery screen
 * regains focus (tab switch back, app foreground).
 */
export function useDiscoveryOffers(filters: DiscoveryFilters | null) {
  return useQuery({
    queryKey: ["discovery", "offers", filters],
    queryFn: async () => {
      if (!filters) throw new Error("filters required");
      return (await client.discovery.offers({
        lat: filters.lat,
        lng: filters.lng,
        radiusM: filters.radiusM,
        category: filters.category,
        diet: filters.diet,
        q: filters.q,
        pickupBefore: filters.pickupBefore,
        pickupAfter: filters.pickupAfter,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
      })) as DiscoveryOffersResponse;
    },
    enabled: filters !== null,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });
}

export interface MapBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function useDiscoveryMap(
  bbox: MapBbox | null,
  category?: DiscoveryFilters["category"],
) {
  return useQuery({
    queryKey: ["discovery", "map", bbox, category],
    queryFn: async () => {
      if (!bbox) throw new Error("bbox required");
      return (await client.discovery.map({
        west: bbox.west,
        south: bbox.south,
        east: bbox.east,
        north: bbox.north,
        category,
      })) as DiscoveryMapResponse;
    },
    enabled: bbox !== null,
    staleTime: 20_000,
  });
}

export function useStoreProfile(storeId: string | null) {
  return useQuery({
    queryKey: ["discovery", "store", storeId],
    queryFn: async () => {
      if (!storeId) throw new Error("storeId required");
      return (await client.discovery.store(storeId)) as DiscoveryStoreProfile;
    },
    enabled: storeId !== null,
    staleTime: 15_000,
  });
}
