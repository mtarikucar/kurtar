import { createHash } from "crypto";
import { encodeGeohash } from "../../common/utils/geohash.util";

const CACHE_VERSION = "v1";
const GEOHASH_PRECISION = 5; // ~4.9km x 4.9km cells — coarser than the 3000m default radius, finer than the 20000m max.

export interface DiscoveryOffersCacheParams {
  lat: number;
  lng: number;
  radiusM: number;
  category?: string;
  diet?: string[];
  pickupAfter?: string;
  pickupBefore?: string;
  q?: string;
  page: number;
  pageSize: number;
}

/**
 * `disc:v1:{geohash5(lat,lng)}:{sha1(sorted filter params)}` per the
 * brief. Two calls with the SAME logical filters produce the SAME key
 * regardless of:
 *   - object property insertion order (the filter object below is
 *     rebuilt with alphabetically-sorted keys before hashing);
 *   - the diet array's element order (sorted before hashing — "VEGAN,
 *     VEGETARIAN" and "VEGETARIAN,VEGAN" are the same filter);
 *   - small lat/lng jitter that stays within the same geohash cell (the
 *     whole point of bucketing by geohash rather than hashing the raw
 *     coordinates).
 */
export function buildDiscoveryOffersCacheKey(
  params: DiscoveryOffersCacheParams,
): string {
  const geohash = encodeGeohash(params.lat, params.lng, GEOHASH_PRECISION);

  const filters: Record<string, unknown> = {
    radiusM: params.radiusM,
    category: params.category ?? null,
    diet:
      params.diet && params.diet.length > 0 ? [...params.diet].sort() : null,
    pickupAfter: params.pickupAfter ?? null,
    pickupBefore: params.pickupBefore ?? null,
    q: params.q ?? null,
    page: params.page,
    pageSize: params.pageSize,
  };
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(filters).sort()) {
    canonical[key] = filters[key];
  }

  const hash = createHash("sha1")
    .update(JSON.stringify(canonical))
    .digest("hex");

  return `disc:${CACHE_VERSION}:${geohash}:${hash}`;
}
