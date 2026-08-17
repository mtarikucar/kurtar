import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import type { DiscoveryOfferItem } from "../lib/api-types";
import {
  formatDistance,
  formatPickupWindow,
  formatPriceCents,
  formatValueBand,
} from "../lib/format";
import { Badge } from "./Badge";

interface OfferCardProps {
  offer: DiscoveryOfferItem;
  onPress: () => void;
}

const LOW_STOCK_THRESHOLD = 3;

export function OfferCard({ offer, onPress }: OfferCardProps) {
  const { t } = useTranslation();
  const soldOut = offer.qtyLeft <= 0;
  const lowStock = !soldOut && offer.qtyLeft <= LOW_STOCK_THRESHOLD;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${offer.store.name}, ${offer.template.title}, ${formatPriceCents(offer.template.priceCents)}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {offer.coverImageUrl ? (
        <Image
          source={{ uri: offer.coverImageUrl }}
          style={styles.image}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.image, styles.imageFallback]}>
          <Text style={styles.imageFallbackText}>🥡</Text>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.storeName} numberOfLines={1}>
            {offer.store.name}
          </Text>
          <Text style={styles.distance}>{formatDistance(offer.store.distanceM)}</Text>
        </View>

        <Text style={styles.title} numberOfLines={1}>
          {offer.template.title}
        </Text>

        <Text style={styles.pickupWindow}>
          {formatPickupWindow(offer.pickupStartAt, offer.pickupEndAt)}
        </Text>

        <View style={styles.footerRow}>
          <View style={styles.priceGroup}>
            <Text style={styles.price}>{formatPriceCents(offer.template.priceCents)}</Text>
            <Text style={styles.valueBand}>
              {formatValueBand(
                offer.template.originalValueCentsMin,
                offer.template.originalValueCentsMax,
              )}
            </Text>
          </View>
          {soldOut ? (
            <Badge label={t("discover.soldOut")} tone="neutral" />
          ) : lowStock ? (
            <Badge
              label={t("discover.packagesLeft", { count: offer.qtyLeft })}
              tone="warning"
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.neutral[0],
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  pressed: {
    opacity: 0.85,
  },
  image: {
    width: 96,
    height: 112,
  },
  imageFallback: {
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  imageFallbackText: {
    fontSize: 32,
  },
  body: {
    flex: 1,
    padding: spacing.md,
    gap: 2,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  storeName: {
    flex: 1,
    fontSize: typeScale.caption.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[600],
  },
  distance: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[500],
  },
  title: {
    fontSize: typeScale.body.size,
    fontWeight: typeScale.h3.weight,
    color: colors.neutral[900],
  },
  pickupWindow: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[600],
  },
  footerRow: {
    marginTop: spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  price: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.h3.weight,
    color: colors.primary[600],
  },
  valueBand: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[400],
    textDecorationLine: "line-through",
  },
});
