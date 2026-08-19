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
  /** Lifts the matching pin 8pt and gives it the sodium fill (spec §4.2:
   * "Selected: accent.sodyum fill, #12181F ink, lifted 8pt"). `null`/
   * omitted when nothing is selected. */
  selectedStoreId?: string | null;
}
