import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { LiveClock } from "../../components/LiveClock";
import { SwipeToConfirm } from "../../components/SwipeToConfirm";
import { useOrderDetails } from "../../hooks/use-order-details";
import { useRedeemReconciliation } from "../../hooks/use-redeem-reconciliation";
import { formatClockTime } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";

/**
 * The redeem screen's own state machine, layered on top of
 * use-redeem-reconciliation.ts's redeem/queued/reconciled model:
 *
 *   not CONFIRMED yet / already terminal (cancelled/expired) -> notRedeemable
 *   CONFIRMED, not yet redeemed, not swiped -> ready (swipe control shown)
 *   swiped, mid-flight (POST /reservations/:id/redeem in progress) -> swipe disabled
 *   swiped, server rejected for a real reason -> error shown inline, swipe re-enabled
 *   swiped, server unreachable -> offline fallback queued (orange)
 *   swiped, offline fallback queued, server reachable but not yet flipped -> waiting
 *   status is REDEEMED (direct success, reconciled via polling, OR because
 *     the screen was reopened after an earlier successful pickup) -> success (green)
 */
export default function RedeemScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useOrderDetails(id ?? "");
  const {
    queued,
    queueChecked,
    confirm,
    redeeming,
    reconciled,
    redeemedAt,
    isOffline,
  } = useRedeemReconciliation(id ?? "");
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const handleConfirm = () => {
    setConfirmError(null);
    confirm().catch((err: unknown) => setConfirmError(getErrorMessage(err, t)));
  };

  if (isLoading || !queueChecked) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t("redeem.notRedeemableTitle")}
          ctaLabel={t("common.back")}
          onPressCta={() => router.back()}
        />
      </Screen>
    );
  }

  const alreadyRedeemed = data.reservation.status === "REDEEMED";
  const isSuccess = alreadyRedeemed || reconciled;
  const isRedeemable = data.reservation.status === "CONFIRMED";

  if (!isSuccess && !isRedeemable) {
    return (
      <Screen>
        <EmptyState
          icon="time-outline"
          title={t("redeem.notRedeemableTitle")}
          body={t("redeem.notRedeemableBody")}
          ctaLabel={t("orders.viewCta")}
          onPressCta={() => router.replace({ pathname: "/order/[id]", params: { id } })}
        />
      </Screen>
    );
  }

  if (isSuccess) {
    const time = data.reservation.redeemedAt ?? redeemedAt;
    return (
      <Screen style={[styles.fullBleed, styles.successBg]} edges={["top", "bottom"]} padded={false}>
        <View style={styles.centerContent}>
          <Ionicons name="checkmark-circle" size={96} color={colors.neutral[0]} />
          <Text style={styles.successTitle}>{t("redeem.successTitle")}</Text>
          <Text style={styles.successBody}>
            {t("redeem.successBody", { time: time ? formatClockTime(time) : "" })}
          </Text>
          <Button
            label={t("redeem.rateCta")}
            variant="secondary"
            onPress={() => router.replace({ pathname: "/rate/[id]", params: { id } })}
            style={styles.successButton}
          />
          <Button
            label={t("redeem.doneCta")}
            variant="ghost"
            onPress={() => router.replace("/(tabs)/orders")}
          />
        </View>
      </Screen>
    );
  }

  const offline = queued !== null && isOffline;
  const waiting = queued !== null && !isOffline;

  return (
    <Screen
      style={[styles.fullBleed, offline ? styles.offlineBg : styles.readyBg]}
      edges={["top", "bottom"]}
      padded={false}
    >
      <View style={styles.centerContent}>
        <Text style={styles.storeName}>{data.storeName}</Text>
        {data.bagTitle ? <Text style={styles.bagTitle}>{data.bagTitle}</Text> : null}

        <LiveClock color={colors.neutral[0]} />
        <Text style={styles.clockHint}>{t("redeem.liveClockHint")}</Text>

        <View style={styles.codeBlock}>
          <Text style={styles.codeLabel}>{t("redeem.codeLabel")}</Text>
          <Text style={styles.code} testID="redeem-code">
            {data.reservation.code}
          </Text>
          <Text style={styles.qty}>
            {t("redeem.qtyLabel")}: {data.reservation.qty}
          </Text>
        </View>

        {offline ? (
          <View style={styles.statusBanner}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.neutral[900]} />
            <Text style={styles.statusBannerText}>{t("redeem.offlineBody")}</Text>
          </View>
        ) : waiting ? (
          <Text style={styles.waitingText}>{t("redeem.waitingForStaff")}</Text>
        ) : (
          <SwipeToConfirm
            label={t("redeem.swipeCta")}
            onConfirm={handleConfirm}
            disabled={queued !== null || redeeming}
          />
        )}

        {!waiting && !offline ? (
          <Text style={styles.swipeHint}>{t("redeem.swipeHint")}</Text>
        ) : null}

        {confirmError ? (
          <Text style={styles.errorText}>{confirmError}</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fullBleed: {
    flex: 1,
  },
  readyBg: {
    backgroundColor: colors.primary[500],
  },
  offlineBg: {
    backgroundColor: colors.semantic.warning[500],
  },
  successBg: {
    backgroundColor: colors.secondary[500],
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing["2xl"],
  },
  storeName: {
    fontSize: typeScale.h2.size,
    fontWeight: typeScale.h2.weight,
    color: colors.neutral[0],
    textAlign: "center",
  },
  bagTitle: {
    fontSize: typeScale.body.size,
    color: colors.neutral[0],
    opacity: 0.9,
    textAlign: "center",
  },
  clockHint: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[0],
    opacity: 0.85,
    textAlign: "center",
  },
  codeBlock: {
    alignItems: "center",
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  codeLabel: {
    fontSize: typeScale.label.size,
    color: colors.neutral[0],
    opacity: 0.85,
  },
  code: {
    fontSize: 48,
    fontWeight: "800",
    color: colors.neutral[0],
    letterSpacing: 4,
  },
  qty: {
    fontSize: typeScale.body.size,
    color: colors.neutral[0],
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  statusBannerText: {
    flex: 1,
    fontSize: typeScale.caption.size,
    color: colors.neutral[900],
  },
  waitingText: {
    marginTop: spacing.xl,
    fontSize: typeScale.body.size,
    color: colors.neutral[0],
  },
  swipeHint: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[0],
    opacity: 0.85,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  errorText: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[0],
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  successTitle: {
    fontSize: typeScale.display.size,
    fontWeight: typeScale.display.weight,
    color: colors.neutral[0],
  },
  successBody: {
    fontSize: typeScale.body.size,
    color: colors.neutral[0],
    textAlign: "center",
  },
  successButton: {
    marginTop: spacing.lg,
    minWidth: 220,
  },
});
