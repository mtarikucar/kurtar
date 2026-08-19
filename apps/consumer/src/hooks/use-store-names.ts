import { useQueries } from "@tanstack/react-query";
import { client } from "../lib/api-client";

/**
 * Resolves a set of storeIds to human names, one `discovery.store()` call
 * per unique id — deduplicated by React Query's own cache (same query key
 * shape as `useStoreProfile` in use-discovery.ts, so a store this screen
 * needs is shared with one any other screen already fetched, and vice
 * versa).
 *
 * `GET /reservations/mine` (ReservationDto) carries no store name — see
 * lib/purchase-cache.ts's doc comment on why — and unlike a single order's
 * detail screen, the profile street and the orders list both need MANY
 * store names at once, so this fans the same public, unauthenticated
 * lookup out over every distinct id in one hook rather than composing N
 * separate `useStoreProfile` calls at N different call sites.
 */
export function useStoreNames(storeIds: readonly string[]): {
  adGetir: (storeId: string) => string | null;
  isLoading: boolean;
} {
  const benzersizIdler = [...new Set(storeIds)];

  const sonuclar = useQueries({
    queries: benzersizIdler.map((storeId) => ({
      queryKey: ["discovery", "store", storeId] as const,
      queryFn: () => client.discovery.store(storeId),
      staleTime: 15_000,
    })),
  });

  const adlar = new Map<string, string>();
  let yukleniyor = false;
  benzersizIdler.forEach((storeId, i) => {
    const sonuc = sonuclar[i];
    if (!sonuc) return;
    if (sonuc.data) adlar.set(storeId, sonuc.data.store.name);
    else if (sonuc.isLoading) yukleniyor = true;
  });

  return {
    adGetir: (storeId: string) => adlar.get(storeId) ?? null,
    isLoading: yukleniyor,
  };
}
