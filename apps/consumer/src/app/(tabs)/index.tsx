import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { OfferCard } from "../../components/OfferCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { IconButton } from "../../components/IconButton";
import { Button } from "../../components/Button";
import {
  FilterSheet,
  type DiscoveryFilterState,
} from "../../components/FilterSheet";
import { DistrictPicker } from "../../components/DistrictPicker";
import { MapPane } from "../../components/MapPane";
import { useDiscoveryMap, useDiscoveryOffers } from "../../hooks/use-discovery";
import { useEffectiveLocation } from "../../hooks/use-effective-location";
import type { LatLng } from "../../lib/location";
import type { DiscoveryMapPin } from "../../lib/api-types";
import { formatPriceCents } from "../../lib/format";
import type { MapRegion } from "../../components/MapPane.types";

const DEFAULT_FILTERS: DiscoveryFilterState = {
  category: null,
  diet: [],
  radiusM: 3000,
  pickupTime: "ALL",
};

/** Istanbul's rough geographic center — only used as the map's own initial
 * region before ANY location signal (GPS or manual district) exists, so
 * the map view never opens on a blank ocean tile. Replaced the instant
 * real coordinates are available. */
const ISTANBUL_FALLBACK: LatLng = { lat: 41.0082, lng: 28.9784 };

function endOfTodayIso(): string {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [filters, setFilters] = useState<DiscoveryFilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [districtPickerOpen, setDistrictPickerOpen] = useState(false);

  const { coords: effectiveCoords, denied: locationDenied, setManualLocation } =
    useEffectiveLocation();

  const [mapRegion, setMapRegion] = useState<MapRegion | null>(null);
  const [selectedPin, setSelectedPin] = useState<DiscoveryMapPin | null>(null);

  const offersQuery = useDiscoveryOffers(
    effectiveCoords
      ? {
          lat: effectiveCoords.lat,
          lng: effectiveCoords.lng,
          radiusM: filters.radiusM,
          category: filters.category ?? undefined,
          diet: filters.diet.length > 0 ? filters.diet.join(",") : undefined,
          pickupBefore: filters.pickupTime === "TONIGHT" ? endOfTodayIso() : undefined,
        }
      : null,
  );

  const bbox = useMemo(() => {
    if (!mapRegion) return null;
    return {
      west: mapRegion.longitude - mapRegion.longitudeDelta / 2,
      south: mapRegion.latitude - mapRegion.latitudeDelta / 2,
      east: mapRegion.longitude + mapRegion.longitudeDelta / 2,
      north: mapRegion.latitude + mapRegion.latitudeDelta / 2,
    };
  }, [mapRegion]);

  const mapQuery = useDiscoveryMap(
    viewMode === "map" ? bbox : null,
    filters.category ?? undefined,
  );

  const initialMapRegion = useMemo<MapRegion>(() => {
    const center = effectiveCoords ?? ISTANBUL_FALLBACK;
    const delta = filters.radiusM / 55_000; // rough meters->degrees at Istanbul's latitude
    return {
      latitude: center.lat,
      longitude: center.lng,
      latitudeDelta: Math.max(delta, 0.01),
      longitudeDelta: Math.max(delta, 0.01),
    };
  }, [effectiveCoords, filters.radiusM]);

  const handleWidenRadius = () => {
    setFilters((prev) => ({ ...prev, radiusM: Math.min(prev.radiusM * 2, 20000) }));
  };

  const handleSelectDistrict = (coords: LatLng) => {
    setManualLocation(coords);
    setDistrictPickerOpen(false);
  };

  const showLocationBanner = locationDenied;

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("discover.title")}</Text>
        <View style={styles.headerActions}>
          <IconButton
            name={viewMode === "list" ? "map-outline" : "list-outline"}
            accessibilityLabel={
              viewMode === "list" ? t("discover.viewMap") : t("discover.viewList")
            }
            onPress={() => setViewMode(viewMode === "list" ? "map" : "list")}
            testID="toggle-map-view"
          />
          <IconButton
            name="options-outline"
            accessibilityLabel={t("discover.filters.title")}
            onPress={() => setFilterSheetOpen(true)}
            testID="open-filters"
          />
        </View>
      </View>

      {showLocationBanner ? (
        <Pressable
          onPress={() => setDistrictPickerOpen(true)}
          style={styles.banner}
          accessibilityRole="button"
        >
          <Ionicons name="location-outline" size={18} color={colors.semantic.info[700]} />
          <Text style={styles.bannerText}>{t("discover.locationDeniedBanner")}</Text>
        </Pressable>
      ) : null}

      {!effectiveCoords ? (
        <LoadingState />
      ) : viewMode === "list" ? (
        <FlatList
          data={offersQuery.data?.items ?? []}
          keyExtractor={(item) => item.offerId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <OfferCard
              offer={item}
              onPress={() =>
                router.push({
                  pathname: "/offer/[id]",
                  params: {
                    id: item.offerId,
                    storeId: item.store.id,
                    distanceM: String(item.store.distanceM),
                  },
                })
              }
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={offersQuery.isRefetching}
              onRefresh={() => offersQuery.refetch()}
              tintColor={colors.primary[500]}
            />
          }
          ListEmptyComponent={
            offersQuery.isLoading ? (
              <LoadingState />
            ) : offersQuery.isError ? (
              <ErrorState onRetry={() => offersQuery.refetch()} />
            ) : (
              <EmptyState
                icon="restaurant-outline"
                title={t("discover.emptyTitle")}
                body={t("discover.emptyBody")}
                ctaLabel={t("discover.emptyWidenCta")}
                onPressCta={handleWidenRadius}
              />
            )
          }
        />
      ) : (
        <View style={styles.mapContainer}>
          <MapPane
            pins={mapQuery.data ?? []}
            initialRegion={mapRegion ?? initialMapRegion}
            onRegionChangeComplete={setMapRegion}
            onPinPress={setSelectedPin}
            onSwitchToList={() => setViewMode("list")}
          />
          {selectedPin ? (
            <View style={styles.pinCard}>
              <View style={styles.pinCardBody}>
                <Text style={styles.pinCardPrice}>
                  {formatPriceCents(selectedPin.minPriceCents)} {"·"} {selectedPin.offersCount}{" "}
                  paket
                </Text>
              </View>
              <Button
                label={t("offerDetail.viewStoreCta")}
                onPress={() =>
                  router.push({ pathname: "/store/[id]", params: { id: selectedPin.storeId } })
                }
              />
            </View>
          ) : null}
        </View>
      )}

      <FilterSheet
        visible={filterSheetOpen}
        value={filters}
        onApply={setFilters}
        onClose={() => setFilterSheetOpen(false)}
      />
      <DistrictPicker
        visible={districtPickerOpen}
        onSelect={handleSelectDistrict}
        onClose={() => setDistrictPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: 20,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.semantic.info[50],
  },
  bannerText: {
    flex: 1,
    fontSize: typeScale.caption.size,
    color: colors.semantic.info[700],
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: spacing["3xl"],
    gap: spacing.md,
    flexGrow: 1,
  },
  mapContainer: {
    flex: 1,
  },
  pinCard: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.neutral[0],
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: colors.neutral[900],
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pinCardBody: {
    gap: 2,
  },
  pinCardPrice: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[900],
  },
});
