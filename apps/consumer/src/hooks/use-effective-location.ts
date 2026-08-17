import { useEffect, useState } from "react";
import {
  getCurrentLatLng,
  getLocationPermissionState,
  type LatLng,
} from "../lib/location";

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
      if (coords) setGpsLocation(coords);
      else setDenied(true);
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
