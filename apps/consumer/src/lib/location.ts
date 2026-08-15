import * as Location from "expo-location";

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Manual district fallback for a denied/unavailable location permission —
 * the brief requires discovery to "never be a dead end" without location
 * access. `GET /discovery/offers` requires lat/lng (no district-name
 * search exists server-side, and there is no geocoding endpoint), so this
 * is a small hand-maintained list of Istanbul district centroids used ONLY
 * to produce a reasonable lat/lng to search around — approximate by
 * construction (a district-level center, not the user's real position),
 * which is why the picker is explicitly framed as "search around" rather
 * than implying precise positioning. kurtar's stores are Istanbul-only for
 * now (Store.city/district on every seeded fixture); extending this list
 * is a data change, not a code change, once other cities launch.
 */
export const ISTANBUL_DISTRICTS: Array<{ name: string } & LatLng> = [
  { name: "Kadıköy", lat: 40.9927, lng: 29.0277 },
  { name: "Üsküdar", lat: 41.0225, lng: 29.0153 },
  { name: "Beşiktaş", lat: 41.0422, lng: 29.0083 },
  { name: "Şişli", lat: 41.0602, lng: 28.9877 },
  { name: "Beyoğlu", lat: 41.0369, lng: 28.9773 },
  { name: "Fatih", lat: 41.0186, lng: 28.9497 },
  { name: "Bakırköy", lat: 40.9819, lng: 28.8772 },
  { name: "Bahçelievler", lat: 41.0021, lng: 28.8593 },
  { name: "Ataşehir", lat: 40.9923, lng: 29.1244 },
  { name: "Maltepe", lat: 40.9354, lng: 29.1553 },
  { name: "Kartal", lat: 40.9051, lng: 29.1878 },
  { name: "Pendik", lat: 40.8785, lng: 29.2338 },
  { name: "Ümraniye", lat: 41.0165, lng: 29.1244 },
  { name: "Sarıyer", lat: 41.1668, lng: 29.0577 },
  { name: "Zeytinburnu", lat: 40.9950, lng: 28.9020 },
];

export type LocationPermissionState =
  | "undetermined"
  | "granted"
  | "denied";

export async function getLocationPermissionState(): Promise<LocationPermissionState> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status === Location.PermissionStatus.GRANTED) return "granted";
  if (status === Location.PermissionStatus.DENIED) return "denied";
  return "undetermined";
}

export async function requestLocationPermission(): Promise<LocationPermissionState> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED ? "granted" : "denied";
}

/** Best-effort current position. Returns null on any failure (permission
 * revoked mid-session, GPS off, provider timeout) — callers must treat
 * that exactly like "no location", never throw it at the user. */
export async function getCurrentLatLng(): Promise<LatLng | null> {
  try {
    const permission = await getLocationPermissionState();
    if (permission !== "granted") return null;
    const position = await Location.getLastKnownPositionAsync({});
    if (position) {
      return { lat: position.coords.latitude, lng: position.coords.longitude };
    }
    const fresh = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: fresh.coords.latitude, lng: fresh.coords.longitude };
  } catch {
    return null;
  }
}
