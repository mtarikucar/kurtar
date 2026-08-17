import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { IconButton } from "../../components/IconButton";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { useStoreProfile } from "../../hooks/use-discovery";
import { useFavorites, useToggleFavorite } from "../../hooks/use-favorites";
import { formatPickupWindow, formatPriceCents, formatValueBand } from "../../lib/format";

export default function StoreProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const storeQuery = useStoreProfile(id ?? null);
  const favoritesQuery = useFavorites();
  const toggleFavorite = useToggleFavorite();

  const isFavorite =
    favoritesQuery.data?.items.some((f) => f.storeId === id) ?? false;

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="chevron-back"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
        />
        <View style={styles.headerActions}>
          <IconButton
            name="flag-outline"
            accessibilityLabel={t("report.title.STORE")}
            testID="store-report-cta"
            onPress={() =>
              id &&
              router.push({
                pathname: "/report/new",
                params: { targetType: "STORE", targetId: id },
              })
            }
          />
          <IconButton
            name={isFavorite ? "heart" : "heart-outline"}
            color={isFavorite ? colors.primary[500] : colors.neutral[800]}
            accessibilityLabel={
              isFavorite ? t("storeProfile.unfavoriteCta") : t("storeProfile.favoriteCta")
            }
            testID="favorite-toggle"
            onPress={() =>
              id && toggleFavorite.mutate({ storeId: id, isFavorite })
            }
          />
        </View>
      </View>

      {storeQuery.isLoading ? (
        <LoadingState />
      ) : storeQuery.isError || !storeQuery.data ? (
        <ErrorState onRetry={() => storeQuery.refetch()} />
      ) : (
        <FlatList
          data={storeQuery.data.todaysOffers}
          keyExtractor={(item) => item.offerId}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              {storeQuery.data.store.coverImageUrl ? (
                <Image
                  source={{ uri: storeQuery.data.store.coverImageUrl }}
                  style={styles.cover}
                />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Text style={styles.coverFallbackText}>🏬</Text>
                </View>
              )}
              <Text style={styles.storeName}>{storeQuery.data.store.name}</Text>
              <View style={styles.metaRow}>
                <Ionicons name="star" size={14} color={colors.primary[500]} />
                <Text style={styles.metaText}>
                  {storeQuery.data.rating.count > 0
                    ? `${storeQuery.data.rating.average.toFixed(1)} · ${t("storeProfile.ratingCount", { count: storeQuery.data.rating.count })}`
                    : t("offerDetail.noRatingYet")}
                </Text>
              </View>
              <Text style={styles.address}>
                {storeQuery.data.store.address}, {storeQuery.data.store.district}
              </Text>
              <Text style={styles.sectionTitle}>{t("storeProfile.todaysOffers")}</Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState icon="cafe-outline" title={t("storeProfile.noOffersToday")} />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.template.title}
              style={({ pressed }) => [styles.offerRow, pressed && { opacity: 0.85 }]}
              onPress={() =>
                router.push({
                  pathname: "/offer/[id]",
                  params: { id: item.offerId, storeId: id },
                })
              }
            >
              <View style={styles.offerRowBody}>
                <Text style={styles.offerTitle}>{item.template.title}</Text>
                <Text style={styles.offerMeta}>
                  {formatPickupWindow(item.pickupStartAt, item.pickupEndAt)}
                </Text>
              </View>
              <View style={styles.offerPriceGroup}>
                <Text style={styles.offerPrice}>
                  {formatPriceCents(item.template.priceCents)}
                </Text>
                <Text style={styles.offerValueBand}>
                  {formatValueBand(
                    item.template.originalValueCentsMin,
                    item.template.originalValueCentsMax,
                  )}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: spacing["3xl"],
    gap: spacing.sm,
  },
  cover: {
    width: "100%",
    height: 160,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
  },
  coverFallback: {
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  coverFallbackText: {
    fontSize: 48,
  },
  storeName: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  metaText: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[600],
  },
  address: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[500],
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.neutral[900],
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  offerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.neutral[0],
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  offerRowBody: {
    flex: 1,
    gap: 2,
  },
  offerTitle: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[900],
  },
  offerMeta: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[600],
  },
  offerPriceGroup: {
    alignItems: "flex-end",
  },
  offerPrice: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.primary[600],
  },
  offerValueBand: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[400],
    textDecorationLine: "line-through",
  },
});
