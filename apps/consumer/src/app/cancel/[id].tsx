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
import { useReservations, useCancelReservation } from "../../hooks/use-reservations";
import { formatClockTime } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";

export default function CancelScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reservationsQuery = useReservations();
  const cancelReservation = useCancelReservation();
  const [error, setError] = useState<string | null>(null);

  const reservation = reservationsQuery.data?.items.find((r) => r.id === id);

  if (reservationsQuery.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (!reservation) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title={t("errors.RESERVATION_NOT_FOUND")} />
      </Screen>
    );
  }

  const deadline = new Date(reservation.cancelDeadlineAt);
  const deadlinePassed = deadline.getTime() <= Date.now();

  const handleCancel = async () => {
    setError(null);
    try {
      await cancelReservation.mutateAsync(reservation.id);
      router.back();
    } catch (err) {
      setError(getErrorMessage(err, t));
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Ionicons name="warning-outline" size={40} color={colors.semantic.warning[500]} />
        <Text style={styles.title}>{t("cancel.title")}</Text>
        <Text style={styles.body}>{t("cancel.body")}</Text>

        {deadlinePassed ? (
          <Text style={styles.warning}>{t("cancel.notCancellable")}</Text>
        ) : (
          <>
            <Text style={styles.note}>{t("cancel.refundNote")}</Text>
            <Text style={styles.deadline}>
              {t("cancel.deadlineNote", { time: formatClockTime(deadline) })}
            </Text>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!deadlinePassed ? (
          <Button
            label={t("cancel.cta")}
            variant="danger"
            onPress={handleCancel}
            loading={cancelReservation.isPending}
          />
        ) : null}
        <Button label={t("cancel.keepCta")} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
  },
  body: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
    textAlign: "center",
  },
  note: {
    fontSize: typeScale.caption.size,
    color: colors.secondary[700],
    textAlign: "center",
  },
  deadline: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[500],
  },
  warning: {
    fontSize: typeScale.body.size,
    color: colors.semantic.danger[500],
    textAlign: "center",
  },
  error: {
    fontSize: typeScale.caption.size,
    color: colors.semantic.danger[500],
    textAlign: "center",
  },
});
