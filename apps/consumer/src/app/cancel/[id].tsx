import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";
import { useReservations, useCancelReservation } from "../../hooks/use-reservations";
import { formatClockTime } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";

/**
 * İPTAL — give a package back.
 *
 * Awning red appears exactly twice, and both times as a FILL with
 * `#12181F` ink on it (§1.1's non-negotiable rule): the destructive CTA,
 * and the note that says the deadline has passed. Red is never loose type
 * on a surface here — at night it is 4.38:1 on a card, and by day the
 * ground is the wrong surface for it, so a single red-text treatment
 * cannot survive the phase inversion at all.
 */
export default function CancelScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
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
        <EmptyState
          icon="alert-circle-outline"
          title={t("errors.RESERVATION_NOT_FOUND")}
          ctaLabel={t("common.back")}
          onPressCta={() => router.back()}
        />
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
      <View style={styles.icerik}>
        <Ionicons name="warning-outline" size={36} color={palet.yaziSisZemin} />
        <Text style={[yazi.title, styles.baslik, { color: palet.yaziAnaZemin }]}>
          {t("cancel.title")}
        </Text>
        <Text style={[yazi.body, styles.govde, { color: palet.yaziSisZemin }]}>
          {t("cancel.body")}
        </Text>

        {deadlinePassed ? (
          <View style={[styles.uyari, { backgroundColor: palet.tenteDolgu }]}>
            <Text
              style={[yazi.data, styles.uyariYazisi, { color: palet.tenteMurekkep }]}
              maxFontSizeMultiplier={1.3}
            >
              {t("cancel.notCancellable")}
            </Text>
          </View>
        ) : (
          <View style={[styles.not, { backgroundColor: palet.yuzeyKaldirim }]}>
            <Text
              style={[yazi.data, styles.uyariYazisi, { color: palet.yaziAna }]}
              maxFontSizeMultiplier={1.3}
            >
              {t("cancel.refundNote")}
            </Text>
            <Text
              style={[yazi.data, styles.uyariYazisi, { color: palet.yaziSis }]}
              maxFontSizeMultiplier={1.3}
            >
              {t("cancel.deadlineNote", { time: formatClockTime(deadline) })}
            </Text>
          </View>
        )}

        {error ? (
          <View style={[styles.uyari, { backgroundColor: palet.tenteDolgu }]}>
            <Text
              style={[yazi.data, styles.uyariYazisi, { color: palet.tenteMurekkep }]}
              maxFontSizeMultiplier={1.3}
            >
              {error}
            </Text>
          </View>
        ) : null}

        <View style={styles.eylemler}>
          {!deadlinePassed ? (
            <Button
              label={t("cancel.cta")}
              varyant="tehlike"
              onPress={handleCancel}
              loading={cancelReservation.isPending}
            />
          ) : null}
          <Button label={t("cancel.keepCta")} varyant="ikincil" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icerik: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: s.s3,
  },
  baslik: { textAlign: "center" },
  govde: { textAlign: "center" },
  not: {
    alignSelf: "stretch",
    borderRadius: r.card,
    padding: s.s3,
    gap: 2,
  },
  uyari: {
    alignSelf: "stretch",
    borderRadius: r.plaque,
    paddingHorizontal: s.s3,
    paddingVertical: s.s2,
  },
  uyariYazisi: { textAlign: "center" },
  eylemler: { alignSelf: "stretch", marginTop: s.s4, gap: s.s2 },
});
