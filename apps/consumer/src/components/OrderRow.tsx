import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import type { ReservationItem } from "../lib/api-types";
import { getPurchaseSnapshot } from "../lib/purchase-cache";
import { derivePickupStartAt } from "../lib/constants";
import { formatPriceCents } from "../lib/format";
import { Badge } from "./Badge";
import { PickupCountdown } from "./PickupCountdown";

interface OrderRowProps {
  reservation: ReservationItem;
  onPress: () => void;
}

const STATUS_TONE: Record<ReservationItem["status"], "brand" | "success" | "warning" | "neutral"> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "brand",
  REDEEMED: "success",
  CANCELLED_BY_USER: "neutral",
  CANCELLED_BY_MERCHANT: "neutral",
  NO_SHOW: "neutral",
  EXPIRED: "neutral",
};

/** A single Orders-list row. Reads its own purchase-time snapshot from
 * local storage (fast, no network — see purchase-cache.ts) to show a
 * human title instead of a bare code when available; the list itself
 * never makes a network call per row (that would be N round-trips), so a
 * row without a cached snapshot just shows its code — still fully
 * functional, only less rich. */
export function OrderRow({ reservation, onPress }: OrderRowProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPurchaseSnapshot(reservation.id).then((snapshot) => {
      if (!cancelled && snapshot) setTitle(`${snapshot.storeName} · ${snapshot.bagTitle}`);
    });
    return () => {
      cancelled = true;
    };
  }, [reservation.id]);

  const pickupStartAt = derivePickupStartAt(reservation.cancelDeadlineAt).toISOString();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title ?? t("orders.code")} ${reservation.code}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? `${t("orders.code")}: ${reservation.code}`}
        </Text>
        <Badge
          label={t(`orders.status.${reservation.status}`)}
          tone={STATUS_TONE[reservation.status]}
        />
      </View>

      <View style={styles.codeRow}>
        <Text style={styles.code}>{reservation.code}</Text>
        <Text style={styles.price}>{formatPriceCents(reservation.totalCents)}</Text>
      </View>

      {reservation.status === "CONFIRMED" ? (
        <PickupCountdown pickupStartAt={pickupStartAt} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.neutral[0],
    borderWidth: 1,
    borderColor: colors.neutral[100],
    gap: spacing.xs,
  },
  rowPressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[900],
  },
  codeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  code: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.primary[600],
    letterSpacing: 1,
  },
  price: {
    fontSize: typeScale.body.size,
    color: colors.neutral[700],
  },
});
