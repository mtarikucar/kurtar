import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { IconButton } from "../../components/IconButton";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { PickupCountdown } from "../../components/PickupCountdown";
import { useOrderDetails } from "../../hooks/use-order-details";
import { formatPriceCents } from "../../lib/format";
import type { ReservationItem } from "../../lib/api-types";

const STATUS_TONE: Record<ReservationItem["status"], "brand" | "success" | "warning" | "neutral"> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "brand",
  REDEEMED: "success",
  CANCELLED_BY_USER: "neutral",
  CANCELLED_BY_MERCHANT: "neutral",
  NO_SHOW: "neutral",
  EXPIRED: "neutral",
};

export default function OrderDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useOrderDetails(id ?? "");

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="chevron-back"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>{t("orders.title")}</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <LoadingState />
      ) : !data ? (
        <EmptyState icon="alert-circle-outline" title={t("errors.RESERVATION_NOT_FOUND")} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {data.coverImageUrl ? (
            <Image source={{ uri: data.coverImageUrl }} style={styles.cover} />
          ) : null}

          <View style={styles.titleRow}>
            <Text style={styles.storeName}>{data.storeName}</Text>
            <Badge
              label={t(`orders.status.${data.reservation.status}`)}
              tone={STATUS_TONE[data.reservation.status]}
            />
          </View>
          {data.bagTitle ? <Text style={styles.bagTitle}>{data.bagTitle}</Text> : null}

          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>{t("orders.code")}</Text>
            <Text style={styles.code}>{data.reservation.code}</Text>
          </View>

          {data.reservation.status === "CONFIRMED" ? (
            <PickupCountdown pickupStartAt={data.pickupStartAt} />
          ) : null}

          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t("redeem.qtyLabel")}</Text>
            <Text style={styles.rowValue}>{data.reservation.qty}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t("purchase.total")}</Text>
            <Text style={styles.rowValue}>{formatPriceCents(data.reservation.totalCents)}</Text>
          </View>

          <View style={styles.actions}>
            {data.reservation.status === "CONFIRMED" ? (
              <>
                <Button
                  label={t("orders.redeemCta")}
                  onPress={() =>
                    router.push({ pathname: "/redeem/[id]", params: { id: data.reservation.id } })
                  }
                />
                {new Date(data.reservation.cancelDeadlineAt).getTime() > Date.now() ? (
                  <Button
                    label={t("orders.cancelCta")}
                    variant="ghost"
                    onPress={() =>
                      router.push({ pathname: "/cancel/[id]", params: { id: data.reservation.id } })
                    }
                  />
                ) : null}
              </>
            ) : null}

            {data.reservation.status === "REDEEMED" ? (
              <Button
                label={t("orders.rateCta")}
                onPress={() =>
                  router.push({ pathname: "/rate/[id]", params: { id: data.reservation.id } })
                }
              />
            ) : null}

            {data.reservation.status === "PENDING_PAYMENT" ? (
              <Button
                label={t("orders.cancelCta")}
                variant="ghost"
                onPress={() =>
                  router.push({ pathname: "/cancel/[id]", params: { id: data.reservation.id } })
                }
              />
            ) : null}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.neutral[900],
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: spacing["3xl"],
    gap: spacing.sm,
  },
  cover: {
    width: "100%",
    height: 140,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  storeName: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
  },
  bagTitle: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
  },
  codeCard: {
    marginTop: spacing.md,
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.primary[50],
  },
  codeLabel: {
    fontSize: typeScale.label.size,
    color: colors.primary[700],
  },
  code: {
    fontSize: typeScale.display.size,
    fontWeight: typeScale.display.weight,
    color: colors.primary[700],
    letterSpacing: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
  },
  rowValue: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[900],
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
});
