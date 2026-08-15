import { useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { Platform } from "react-native";
import Supercluster, { type PointFeature } from "supercluster";
import { colors, radii } from "@kurtar/ui-tokens";
import type { DiscoveryMapPin } from "../lib/api-types";
import { formatPriceCents } from "../lib/format";
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
 * Native (iOS/Android) map pane — Apple Maps provider on iOS (the RN Maps
 * default), Google provider on Android, per the brief. Clusters pins with
 * `supercluster` client-side (the `/discovery/map` bbox query already caps
 * results at 500 pins server-side — see discovery.service.ts's
 * MAP_PINS_LIMIT — so clustering a bounded result set client-side is
 * cheap, no server-side clustering endpoint needed).
 */
export function MapPane({
  pins,
  initialRegion,
  onRegionChangeComplete,
  onPinPress,
}: MapPaneProps) {
  const mapRef = useRef<MapView | null>(null);
  const regionRef = useRef<MapRegion>(initialRegion);

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
      300,
    );
  };

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      initialRegion={initialRegion}
      onRegionChangeComplete={handleRegionChangeComplete}
      showsUserLocation
      showsMyLocationButton
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
            <Marker
              key={`cluster-${clusterId}`}
              coordinate={{ latitude: lat, longitude: lng }}
              onPress={() => handleClusterPress(clusterId, lng, lat)}
              accessibilityLabel={`${count} mağaza — yakınlaştırmak için dokun`}
            >
              <View style={styles.clusterMarker}>
                <Text style={styles.clusterMarkerText}>{count}</Text>
              </View>
            </Marker>
          );
        }

        const pin = properties.pin;
        return (
          <Marker
            key={pin.storeId}
            coordinate={{ latitude: lat, longitude: lng }}
            onPress={() => onPinPress(pin)}
            accessibilityLabel={`Mağaza, ${formatPriceCents(pin.minPriceCents)}'den başlayan fiyatlarla`}
          >
            <View style={styles.pinMarker}>
              <Text style={styles.pinMarkerText}>{formatPriceCents(pin.minPriceCents)}</Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  clusterMarker: {
    minWidth: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.secondary[500],
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.neutral[0],
  },
  clusterMarkerText: {
    color: colors.neutral[0],
    fontWeight: "700",
  },
  pinMarker: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.neutral[0],
  },
  pinMarkerText: {
    color: colors.neutral[0],
    fontWeight: "700",
    fontSize: 12,
  },
});
