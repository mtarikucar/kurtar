import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { Chip } from "../../components/Chip";
import { OfferCard } from "../../components/OfferCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { useDiscoveryOffers } from "../../hooks/use-discovery";
import { useEffectiveLocation } from "../../hooks/use-effective-location";
import { DistrictPicker } from "../../components/DistrictPicker";
import type { CategoryFilter } from "../../components/FilterSheet";

const CATEGORIES: CategoryFilter[] = ["MEAL", "BAKERY", "GROCERY", "PRODUCE", "OTHER"];

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter | null>(null);
  const [districtPickerOpen, setDistrictPickerOpen] = useState(false);
  const { coords, denied, setManualLocation } = useEffectiveLocation();

  const hasSearch = query.trim().length > 0 || category !== null;

  const offersQuery = useDiscoveryOffers(
    coords && hasSearch
      ? {
          lat: coords.lat,
          lng: coords.lng,
          radiusM: 20000,
          category: category ?? undefined,
          q: query.trim().length > 0 ? query.trim() : undefined,
          pageSize: 30,
        }
      : null,
  );

  return (
    <Screen>
      <Text style={styles.title}>{t("tabs.search")}</Text>

      <TextField
        label={t("search.placeholder")}
        placeholder={t("search.placeholder")}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />

      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={t(`discover.categories.${c}`)}
            selected={category === c}
            onPress={() => setCategory(category === c ? null : c)}
          />
        ))}
      </View>

      {denied ? (
        <Chip
          label={t("discover.chooseDistrict")}
          onPress={() => setDistrictPickerOpen(true)}
        />
      ) : null}

      <View style={styles.results}>
        {!hasSearch ? (
          <EmptyState
            icon="search-outline"
            title={t("search.prompt")}
            body={t("search.promptBody")}
          />
        ) : !coords ? (
          <LoadingState />
        ) : offersQuery.isLoading ? (
          <LoadingState />
        ) : offersQuery.isError ? (
          <ErrorState onRetry={() => offersQuery.refetch()} />
        ) : (offersQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon="sad-outline"
            title={t("search.emptyTitle")}
            body={t("search.emptyBody", { query: query || category })}
          />
        ) : (
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
          />
        )}
      </View>

      <DistrictPicker
        visible={districtPickerOpen}
        onSelect={(coordsValue) => {
          setManualLocation(coordsValue);
          setDistrictPickerOpen(false);
        }}
        onClose={() => setDistrictPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  results: {
    flex: 1,
    marginTop: spacing.md,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing["3xl"],
  },
});
