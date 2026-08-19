import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type MapMarker,
  type Region,
} from "react-native-maps";
import Supercluster, { type PointFeature } from "supercluster";
import { useReduceMotion } from "../design/reduce-motion";
import { usePalet } from "../design/theme";
import { m, r, yazi, type Palet } from "../design/tokens";
import { fiyatMetni } from "./kepenk";
import type { DiscoveryMapPin } from "../lib/api-types";
import type { MapPaneProps, MapRegion } from "./MapPane.types";

type PinProperties = { pin: DiscoveryMapPin };

/** Rough web-mercator zoom level from a region's latitudeDelta — supercluster
 * clusters by zoom level, not by raw delta, so this converts what MapView
 * gives us into what it expects. */
function zoomFromRegion(region: MapRegion): number {
  const zoom = Math.log2(360 / region.latitudeDelta);
  return Math.max(0, Math.min(20, Math.round(zoom)));
}

function regionToBbox(region: MapRegion): [number, number, number, number] {
  return [
    region.longitude - region.longitudeDelta / 2,
    region.latitude - region.latitudeDelta / 2,
    region.longitude + region.longitudeDelta / 2,
    region.latitude + region.latitudeDelta / 2,
  ];
}

/**
 * The dark Kadıköy street style (spec §4.2): "land bg.asfalt, water
 * bg.derin, roads yuzeyKaldirim, labels text.sis, no POI icons." Built
 * from the SAME palette tokens the rest of the screen reads — the map
 * inverts with the day/night phase exactly like every other surface,
 * because it is the same three frozen objects, not a fourth hand-tuned
 * style.
 *
 * Every label takes STREET type: they are all drawn with a
 * `labels.text.stroke` halo in `bgAsfalt`, so a label crossing water or a
 * road is still on the ground colour as far as the eye is concerned.
 */
function haritaStili(palet: Palet) {
  return [
    { elementType: "geometry", stylers: [{ color: palet.bgAsfalt }] },
    { elementType: "labels.text.fill", stylers: [{ color: palet.yaziSisZemin }] },
    { elementType: "labels.text.stroke", stylers: [{ color: palet.bgAsfalt }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: palet.yuzeyKaldirim }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: palet.yaziSisZemin }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: palet.bgDerin }] },
  ];
}

/**
 * FİYAT PİNİ — a price-chip marker (spec §4.2: "Markers are price chips,
 * 56 × 28, bg.derin fill, 1pt zinc border, data 12 ivory: `69₺`. Selected:
 * accent.sodyum fill, #12181F ink, lifted 8pt").
 *
 * The Android marker rule, non-negotiable (spec §4.2): render the custom
 * view once, THEN flip `tracksViewChanges` to false in `onLayout` — a
 * Custom-View marker on Android is a bitmap snapshot, and leaving
 * `tracksViewChanges` true through any animation is the classic marker
 * flicker. Selection is therefore a discrete re-snapshot (one extra
 * `onLayout` when `secili` flips), never a continuous animation.
 *
 * `setIzle(false)` is idempotent, though, so nothing ever turned the
 * snapshotting back ON — and a colour/ink/lift change does not move the
 * child, so `onLayout` never fired a second time either. The bitmap froze
 * at first layout: tapping a pin produced no visible selection on Android,
 * and the pins kept the daylight fill for the rest of the session after
 * the palette crossed into gece. `redraw()` is the library's own escape
 * hatch for exactly this — one frame, `tracksViewChanges` stays false, no
 * flicker.
 *
 * The chip is FILLED with `bg.derin`, so its numeral is recess type — which
 * is how §4.2's "data 12 ivory" survives into the two light phases, where
 * the app's other primary ink is near-black.
 */
function FiyatPini({ pin, secili, palet, onPress }: { pin: DiscoveryMapPin; secili: boolean; palet: Palet; onPress: () => void }) {
  const [izle, setIzle] = useState(true);
  const pinRef = useRef<MapMarker | null>(null);
  useEffect(() => {
    pinRef.current?.redraw();
  }, [secili, palet]);
  return (
    <Marker
      ref={pinRef}
      coordinate={{ latitude: pin.lat, longitude: pin.lng }}
      onPress={onPress}
      tracksViewChanges={izle}
      zIndex={secili ? 1 : 0}
      accessibilityLabel={
        secili
          ? `Seçili, ${fiyatMetni(pin.minPriceCents)}'den başlayan fiyatlarla`
          : `Mağaza, ${fiyatMetni(pin.minPriceCents)}'den başlayan fiyatlarla`
      }
    >
      <View
        onLayout={() => setIzle(false)}
        style={[
          styles.pin,
          {
            backgroundColor: secili ? palet.sodyumDolgu : palet.bgDerin,
            borderColor: secili ? palet.sodyumDolgu : palet.metalCinko,
            marginBottom: secili ? 8 : 0,
          },
        ]}
      >
        <Text
          style={[yazi.data, { color: secili ? palet.sodyumMurekkep : palet.yaziAnaCukur }]}
          numberOfLines={1}
        >
          {fiyatMetni(pin.minPriceCents)}
        </Text>
      </View>
    </Marker>
  );
}

function KumePini({
  clusterId,
  count,
  lat,
  lng,
  palet,
  onPress,
}: {
  clusterId: number;
  count: number;
  lat: number;
  lng: number;
  palet: Palet;
  onPress: () => void;
}) {
  const [izle, setIzle] = useState(true);
  const kumeRef = useRef<MapMarker | null>(null);
  // Cluster chips take no selection, but they freeze at the phase change
  // for the same reason a price chip does.
  useEffect(() => {
    kumeRef.current?.redraw();
  }, [palet]);
  return (
    <Marker
      ref={kumeRef}
      key={`cluster-${clusterId}`}
      coordinate={{ latitude: lat, longitude: lng }}
      onPress={onPress}
      tracksViewChanges={izle}
      accessibilityLabel={`${count} mağaza — yakınlaştırmak için dokun`}
    >
      <View
        onLayout={() => setIzle(false)}
        style={[styles.kume, { backgroundColor: palet.sodyumDolgu, borderColor: palet.bgDerin }]}
      >
        <Text style={[yazi.dataLg, { color: palet.sodyumMurekkep }]}>{count}</Text>
      </View>
    </Marker>
  );
}

/**
 * Native (iOS/Android) map pane — `PROVIDER_GOOGLE` on BOTH platforms
 * (spec §4.2, non-negotiable: "Apple's provider ignores customMapStyle,
 * so the dark Kadıköy style is only achievable via Google"). This needs a
 * real Google Maps API key configured for iOS before it will render
 * anything there — see app.json's `android.config.googleMaps.apiKey` for
 * the existing Android wiring and build log §4 for what iOS still needs.
 * Clusters pins with `supercluster` client-side (the `/discovery/map`
 * bbox query already caps results at 500 pins server-side, so clustering
 * a bounded result set client-side is cheap).
 */
export function MapPane({
  pins,
  initialRegion,
  onRegionChangeComplete,
  onPinPress,
  selectedStoreId = null,
}: MapPaneProps) {
  const palet = usePalet();
  const azaltHareket = useReduceMotion();
  const mapRef = useRef<MapView | null>(null);
  const regionRef = useRef<MapRegion>(initialRegion);
  const stil = useMemo(() => haritaStili(palet), [palet]);

  const index = useMemo(() => {
    const points: PointFeature<PinProperties>[] = pins.map((pin) => ({
      type: "Feature",
      properties: { pin },
      geometry: { type: "Point", coordinates: [pin.lng, pin.lat] },
    }));
    const cluster = new Supercluster<PinProperties>({ radius: 50, maxZoom: 17 });
    cluster.load(points);
    return cluster;
  }, [pins]);

  const clusters = useMemo(() => {
    try {
      return index.getClusters(
        regionToBbox(regionRef.current),
        zoomFromRegion(regionRef.current),
      );
    } catch {
      return [];
    }
    // Re-derive whenever pins change OR the caller hands us a fresh region.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, initialRegion]);

  const handleRegionChangeComplete = (region: Region) => {
    regionRef.current = region;
    onRegionChangeComplete(region);
  };

  const handleClusterPress = (clusterId: number, lng: number, lat: number) => {
    const expansionZoom = Math.min(index.getClusterExpansionZoom(clusterId), 20);
    const nextDelta = 360 / Math.pow(2, expansionZoom);
    mapRef.current?.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: nextDelta,
        longitudeDelta: nextDelta,
      },
      // A self-driving full-screen camera move is the strongest vestibular
      // trigger left in this app, and it was the one thing on the map that
      // never asked. `null` (answer not yet known) counts as "no
      // movement", as everywhere else. Both natives treat 0 as an instant
      // jump, so the recentre still happens — it is discrete, not slow.
      // The duration is §1.3's own map token now, not an inline 300.
      azaltHareket === false ? m.fast : 0,
    );
  };

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_GOOGLE}
      customMapStyle={stil}
      initialRegion={initialRegion}
      onRegionChangeComplete={handleRegionChangeComplete}
      showsUserLocation
      showsMyLocationButton={false}
      showsPointsOfInterest={false}
    >
      {clusters.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        const properties = feature.properties;

        // supercluster's own return type is a union of ClusterFeature<P>
        // (has `cluster`/`cluster_id`/`point_count`) and PointFeature<P>
        // (has neither) — `in`, checked directly on the discriminant
        // expression (not through an intermediate boolean variable, which
        // loses the narrowing), lets TS pick the right member of the union.
        if ("cluster" in properties && properties.cluster) {
          const clusterId = properties.cluster_id;
          const count = properties.point_count;
          return (
            <KumePini
              key={`cluster-${clusterId}`}
              clusterId={clusterId}
              count={count}
              lat={lat}
              lng={lng}
              palet={palet}
              onPress={() => handleClusterPress(clusterId, lng, lat)}
            />
          );
        }

        const pin = properties.pin;
        return (
          <FiyatPini
            key={pin.storeId}
            pin={pin}
            secili={pin.storeId === selectedStoreId}
            palet={palet}
            onPress={() => onPinPress(pin)}
          />
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: {
    minWidth: 56,
    height: 28,
    borderRadius: r.cta,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  kume: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderWidth: 2,
  },
});
