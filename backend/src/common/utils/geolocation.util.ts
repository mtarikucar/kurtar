/**
 * Geolocation utilities — Haversine distance + coordinate validation.
 * Port of kds's backend/src/common/utils/geolocation.util.ts.
 */

/**
 * Calculate distance between two geographic coordinates using the
 * Haversine formula.
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's radius in meters

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if a location is within a given radius of a target location.
 */
export function isLocationWithinRange(
  customerLat: number,
  customerLon: number,
  targetLat: number,
  targetLon: number,
  maxDistanceMeters: number,
): { isWithinRange: boolean; distance: number } {
  const distance = calculateDistance(
    customerLat,
    customerLon,
    targetLat,
    targetLon,
  );

  return {
    isWithinRange: distance <= maxDistanceMeters,
    distance: Math.round(distance),
  };
}

/**
 * Validate that coordinates fall within their physically valid ranges
 * (latitude -90..90, longitude -180..180).
 */
export function isValidCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  if (latitude === null || latitude === undefined) return false;
  if (longitude === null || longitude === undefined) return false;

  return (
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  );
}
