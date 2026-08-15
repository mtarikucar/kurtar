import type { RequestEngine } from "../engine";

/** Consumer's own given-ratings history. (Rating CREATION lives under `reservations.rate` — a rating is always tied to a specific redeemed reservation. Admin moderation of ratings lives under `admin.ratings`.) Used by apps/consumer. */
export function createRatingsDomain(engine: RequestEngine) {
  return {
    /** GET /ratings/mine */
    listMine: () => engine.request("get", "/api/ratings/mine"),
  };
}

export type RatingsDomain = ReturnType<typeof createRatingsDomain>;
