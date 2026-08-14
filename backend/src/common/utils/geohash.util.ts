/**
 * Minimal geohash encoder — no heavy dependency, just the standard
 * interleaved-bisection algorithm (Gustavo Niemeyer's geohash, the same
 * one Wikipedia and every geohash-js port implement). Encode-only: the
 * discovery cache key (modules/discovery/discovery-cache-key.util.ts) only
 * ever needs to bucket a (lat, lng) pair into a coarse cell, never decode
 * one back.
 *
 * Reference vector (from Wikipedia's geohash article): encodeGeohash(42.6,
 * -5.6, 5) === "ezs42" — see geohash.util.spec.ts.
 */

const BASE32_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(
  latitude: number,
  longitude: number,
  precision = 5,
): string {
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let isEvenBit = true; // geohash interleaves starting with longitude
  let bit = 0;
  let charIndex = 0;
  let hash = "";

  while (hash.length < precision) {
    if (isEvenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (longitude > mid) {
        charIndex |= 1 << (4 - bit);
        lonMin = mid;
      } else {
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude > mid) {
        charIndex |= 1 << (4 - bit);
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    isEvenBit = !isEvenBit;

    if (bit < 4) {
      bit++;
    } else {
      hash += BASE32_ALPHABET[charIndex];
      bit = 0;
      charIndex = 0;
    }
  }

  return hash;
}
