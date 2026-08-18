import type { RequestEngine } from "../engine";
import type { QueryParams } from "../core-types";

/** @Public discovery surface (no auth) — nearby live offers, map pins, store profiles. Used by apps/consumer and landing. */
export function createDiscoveryDomain(engine: RequestEngine) {
  return {
    /**
     * GET /discovery/offers — nearby live offers, paginated.
     *
     * [M18 fix] Accepts an optional `AbortSignal` (a filter change or a
     * fast-typed search query firing a new request before the previous
     * one resolved is exactly the case cancellation exists for) —
     * `RequestOptions.signal` on the underlying engine was already wired
     * all the way to `fetch()`, but no domain method ever exposed it
     * before this fix, so no caller could ever actually pass one.
     */
    offers: (
      query: QueryParams<"/api/discovery/offers", "get">,
      opts?: { signal?: AbortSignal },
    ) =>
      engine.request("get", "/api/discovery/offers", {
        query,
        signal: opts?.signal,
      }),

    /** GET /discovery/map — store pins within a bounding box, for the map view. */
    map: (
      query: QueryParams<"/api/discovery/map", "get">,
      opts?: { signal?: AbortSignal },
    ) =>
      engine.request("get", "/api/discovery/map", {
        query,
        signal: opts?.signal,
      }),

    /** GET /discovery/stores/{id} — a store's public profile (today's offers + rating aggregate). */
    store: (id: string, opts?: { signal?: AbortSignal }) =>
      engine.request("get", "/api/discovery/stores/{id}", {
        path: { id },
        signal: opts?.signal,
      }),

    /** GET /discovery/offers/{id} — a single offer's public share preview (the universal-link bridge page /o/[id]). Same visibility rules as `offers()` — a non-visible or nonexistent offer 404s identically. Used by landing. */
    offer: (id: string, opts?: { signal?: AbortSignal }) =>
      engine.request("get", "/api/discovery/offers/{id}", {
        path: { id },
        signal: opts?.signal,
      }),
  };
}

export type DiscoveryDomain = ReturnType<typeof createDiscoveryDomain>;
