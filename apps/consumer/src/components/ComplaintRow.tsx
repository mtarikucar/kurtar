import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Badge } from "./Badge";
import { formatShortDate } from "../lib/format";

export interface ComplaintListItem {
  id: string;
  category: string;
  description: string;
  status: "OPEN" | "MERCHANT_RESPONDED" | "RESOLVED" | "ESCALATED";
  slaDeadlineAt: string;
  resolvedAt?: string | null;
}

const STATUS_TONE: Record<
  ComplaintListItem["status"],
  "brand" | "success" | "warning" | "neutral"
> = {
  OPEN: "warning",
  MERCHANT_RESPONDED: "brand",
  RESOLVED: "success",
  ESCALATED: "warning",
};

/** A single row on the "Şikayetlerim" list — mirrors OrderRow.tsx's shape
 * (Pressable card, Badge for status, one meta line). */
export function ComplaintRow({
  complaint,
  onPress,
}: {
  complaint: ComplaintListItem;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const categoryLabel = t(`complaint.categories.${complaint.category}`);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={categoryLabel}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.header}>
        <Text style={styles.category}>{categoryLabel}</Text>
        <Badge label={t(`complaints.status.${complaint.status}`)} tone={STATUS_TONE[complaint.status]} />
      </View>
      <Text style={styles.description} numberOfLines={2}>
        {complaint.description}
      </Text>
      <Text style={styles.meta}>
        {complaint.status === "RESOLVED" && complaint.resolvedAt
          ? t("complaints.resolvedAt", { date: formatShortDate(complaint.resolvedAt) })
          : t("complaints.slaDeadline", { date: formatShortDate(complaint.slaDeadlineAt) })}
      </Text>
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
  category: {
    flex: 1,
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[900],
  },
  description: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[600],
  },
  meta: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[500],
  },
});
