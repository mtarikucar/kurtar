import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, type Query } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { KurtarApiError } from "@kurtar/api-client";

/**
 * Discovery moves fast (offers publish 17:00-21:00 and sell out in
 * minutes) — a short staleTime plus refetch-on-focus keeps the list
 * honest, while a business error (409 OFFER_UNAVAILABLE, 4xx validation)
 * never benefits from a blind retry the way a network blip does.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000,
      refetchOnMount: true,
      retry: (failureCount, error) => {
        if (error instanceof KurtarApiError && !error.isNetworkError) {
          return false; // a real 4xx/5xx from the server won't fix itself on retry
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

const PERSIST_KEY_PREFIX = "discovery";

/**
 * Persists ONLY the discovery-offers list to AsyncStorage (brief §"Stack":
 * "AsyncStorage persistence for the discovery list so a cold open shows
 * the last results") — not auth data (that's SecureStore's job, see
 * secure-tokens.ts) and not every other query, which would otherwise
 * quietly serve a stale reservation or impact number after a cold start.
 */
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "kurtar.react-query-cache",
});

export function shouldPersistQuery(query: Query): boolean {
  const [rootKey] = query.queryKey as [string, ...unknown[]];
  return rootKey === PERSIST_KEY_PREFIX;
}
