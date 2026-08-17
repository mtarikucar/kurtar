import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { Badge } from "../../components/Badge";
import { useFavorites } from "../../hooks/use-favorites";
import type { FavoriteListItem } from "../../lib/api-types";

function FavoriteRow({
  item,
  onPress,
}: {
  item: FavoriteListItem;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.store.name}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {item.store.coverImageUrl ? (
        <Image source={{ uri: item.store.coverImageUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarFallbackText}>🏬</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.storeName} numberOfLines={1}>
          {item.store.name}
        </Text>
        <Text style={styles.storeMeta}>
          {item.store.district} · ★ {item.store.avgStars.toFixed(1)} (
          {item.store.ratingCount})
        </Text>
      </View>
      <Badge
        label={
          item.hasLiveOfferToday
            ? t("favorites.hasOfferToday")
            : t("favorites.noOfferToday")
        }
        tone={item.hasLiveOfferToday ? "success" : "neutral"}
      />
    </Pressable>
  );
}

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const favoritesQuery = useFavorites();

  return (
    <Screen>
      <Text style={styles.title}>{t("favorites.title")}</Text>

      {favoritesQuery.isLoading ? (
        <LoadingState />
      ) : favoritesQuery.isError ? (
        <ErrorState onRetry={() => favoritesQuery.refetch()} />
      ) : (favoritesQuery.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon="heart-outline"
          title={t("favorites.emptyTitle")}
          body={t("favorites.emptyBody")}
        />
      ) : (
        <FlatList
          data={favoritesQuery.data?.items ?? []}
          keyExtractor={(item) => item.storeId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <FavoriteRow
              item={item}
              onPress={() =>
                router.push({ pathname: "/store/[id]", params: { id: item.storeId } })
              }
            />
          )}
        />
      )}
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
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing["3xl"],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.neutral[0],
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  rowPressed: {
    opacity: 0.85,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
  },
  avatarFallback: {
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    fontSize: 22,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  storeName: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[900],
  },
  storeMeta: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[600],
  },
});
