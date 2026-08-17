import type { RequestEngine } from "../engine";
import type { QueryParams } from "../core-types";

/** @Public discovery surface (no auth) — nearby live offers, map pins, store profiles. Used by apps/consumer and landing. */
export function createDiscoveryDomain(engine: RequestEngine) {
  return {
    /** GET /discovery/offers — nearby live offers, paginated. */
    offers: (query: QueryParams<"/api/discovery/offers", "get">) =>
      engine.request("get", "/api/discovery/offers", { query }),

    /** GET /discovery/map — store pins within a bounding box, for the map view. */
    map: (query: QueryParams<"/api/discovery/map", "get">) =>
      engine.request("get", "/api/discovery/map", { query }),

    /** GET /discovery/stores/{id} — a store's public profile (today's offers + rating aggregate). */
    store: (id: string) =>
      engine.request("get", "/api/discovery/stores/{id}", { path: { id } }),

    /** GET /discovery/offers/{id} — a single offer's public share preview (the universal-link bridge page /o/[id]). Same visibility rules as `offers()` — a non-visible or nonexistent offer 404s identically. Used by landing. */
    offer: (id: string) =>
      engine.request("get", "/api/discovery/offers/{id}", { path: { id } }),
  };
}

export type DiscoveryDomain = ReturnType<typeof createDiscoveryDomain>;
