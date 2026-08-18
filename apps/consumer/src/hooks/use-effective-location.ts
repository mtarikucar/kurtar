import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getCurrentLatLng,
  getLocationPermissionState,
  type LatLng,
} from "../lib/location";
import { client } from "../lib/api-client";

const LAST_LOCATION_POST_AT_KEY = "kurtar.lastLocationPostAt";

/** Once per this interval is plenty for the OFFER_NEARBY audience (see
 * user-location.service.ts) — and it keeps Discover and Search, which
 * both mount this hook, from double-posting on the same app open. */
const LOCATION_POST_THROTTLE_MS = 15 * 60 * 1000;

/**
 * Best-effort `POST /me/location` so this device counts toward the
 * OFFER_NEARBY push audience — without a write here, `lastLat`/`lastLng`
 * stay NULL forever and offer-published-fanout's `ST_DWithin` filter
 * excludes every user, so the "offers near you" notification can never
 * fire (see docs/review/open-findings.md, I7). Fire-and-forget and
 * throttled: populating a push audience must never block or error out
 * discovery itself.
 */
async function reportLocationIfDue(coords: LatLng): Promise<void> {
  try {
    const lastPostedRaw = await AsyncStorage.getItem(LAST_LOCATION_POST_AT_KEY);
    const lastPostedAt = lastPostedRaw ? Number(lastPostedRaw) : 0;
    if (Date.now() - lastPostedAt < LOCATION_POST_THROTTLE_MS) return;

    await client.account.updateLocation({ lat: coords.lat, lng: coords.lng });
    await AsyncStorage.setItem(LAST_LOCATION_POST_AT_KEY, String(Date.now()));
  } catch {
    // Best-effort — see doc comment above.
  }
}

/**
 * Shared "what coordinates should we search around" resolution — GPS when
 * granted, otherwise null with `denied: true` so the caller can offer the
 * district-picker fallback (never a dead end, per the brief). Used by
 * both Discover and Search, which both need the same coordinate but
 * shouldn't duplicate the permission dance.
 */
export function useEffectiveLocation() {
  const [gpsLocation, setGpsLocation] = useState<LatLng | null>(null);
  const [manualLocation, setManualLocation] = useState<LatLng | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const permission = await getLocationPermissionState();
      if (permission !== "granted") {
        setDenied(true);
        return;
      }
      const coords = await getCurrentLatLng();
      if (coords) {
        setGpsLocation(coords);
        reportLocationIfDue(coords).catch(() => undefined);
      } else {
        setDenied(true);
      }
    })();
  }, []);

  return {
    coords: manualLocation ?? gpsLocation,
    denied: denied && !manualLocation,
    setManualLocation: (coords: LatLng) => {
      setManualLocation(coords);
      setDenied(false);
    },
  };
}
