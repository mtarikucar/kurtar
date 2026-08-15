import { useQuery } from "@tanstack/react-query";
import { client } from "../api/client";
import { asResponse } from "../api/response-types";
import type { BagTemplate, Store } from "../api/response-types";

/**
 * Entity reads shared by more than one screen (Today's quick-publish needs
 * the template list; Mağazalar/Paketler owns their CRUD; Takvim needs both
 * for scheduling) — defined once here rather than duplicated per feature
 * folder, with one React Query cache key each so a mutation in one screen
 * (e.g. creating a template in Mağazalar) invalidates the same data Today
 * reads.
 */
export const storesKey = ["stores", "mine"] as const;
export const bagTemplatesKey = ["bagTemplates", "mine"] as const;
/** Shared by today/hooks.ts (always "today") and calendar/hooks.ts (any
 * date in the visible week) so both screens read/invalidate the exact same
 * cache entry for a given day instead of two independent copies. */
export const offersForDateKey = (dateKey: string) =>
  ["offers", "mine", dateKey] as const;

export function useStores() {
  return useQuery({
    queryKey: storesKey,
    queryFn: async () =>
      asResponse<Store[]>(await client.merchant.stores.list()),
    staleTime: 60_000,
  });
}

export function useBagTemplates() {
  return useQuery({
    queryKey: bagTemplatesKey,
    queryFn: async () =>
      asResponse<BagTemplate[]>(await client.merchant.bagTemplates.list()),
    staleTime: 60_000,
  });
}
