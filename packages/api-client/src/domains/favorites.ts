import type { RequestEngine } from "../engine";

/** Consumer's favorited stores. Used by apps/consumer. */
export function createFavoritesDomain(engine: RequestEngine) {
  return {
    /** POST /stores/{storeId}/favorites */
    add: (storeId: string) =>
      engine.request("post", "/api/stores/{storeId}/favorites", {
        path: { storeId },
      }),

    /** DELETE /stores/{storeId}/favorites */
    remove: (storeId: string) =>
      engine.request("delete", "/api/stores/{storeId}/favorites", {
        path: { storeId },
      }),

    /** GET /me/favorites — the authenticated consumer's favorited stores. */
    listMine: () => engine.request("get", "/api/me/favorites"),
  };
}

export type FavoritesDomain = ReturnType<typeof createFavoritesDomain>;
