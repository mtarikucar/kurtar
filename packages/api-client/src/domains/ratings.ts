import type { RequestEngine } from "../engine";
import type { QueryParams } from "../core-types";

/** Consumer's own given-ratings history. (Rating CREATION lives under `reservations.rate` — a rating is always tied to a specific redeemed reservation. Admin moderation of ratings lives under `admin.ratings`.) Used by apps/consumer. */
export function createRatingsDomain(engine: RequestEngine) {
  return {
    /** GET /ratings/mine — `storeId` is required by the committed contract (backend/src/modules/ratings/dto/ratings-mine-query.dto.ts has no `@IsOptional()` on it); `page`/`pageSize` are declared required in docs/openapi.json too, even though the DTO gives them runtime defaults — matching the contract as declared, not the DTO's runtime leniency. */
    listMine: (query: QueryParams<"/api/ratings/mine", "get">) =>
      engine.request("get", "/api/ratings/mine", { query }),
  };
}

export type RatingsDomain = ReturnType<typeof createRatingsDomain>;
