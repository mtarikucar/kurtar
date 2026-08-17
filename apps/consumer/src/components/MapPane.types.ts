import type { DiscoveryMapPin } from "../lib/api-types";

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapPaneProps {
  pins: DiscoveryMapPin[];
  initialRegion: MapRegion;
  onRegionChangeComplete: (region: MapRegion) => void;
  onPinPress: (pin: DiscoveryMapPin) => void;
  /** Only used by the web fallback (no map to show at all). */
  onSwitchToList: () => void;
}
