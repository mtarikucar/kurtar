import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { StarRating } from "../../components/StarRating";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { useReservations, useRateReservation } from "../../hooks/use-reservations";
import { getErrorMessage } from "../../lib/errors";
import { KurtarApiError } from "@kurtar/api-client";

export default function RateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reservationsQuery = useReservations();
  const rateReservation = useRateReservation();

  const [overallStars, setOverallStars] = useState(0);
  const [foodQuality, setFoodQuality] = useState(0);
  const [service, setService] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  const reservation = reservationsQuery.data?.items.find((r) => r.id === id);

  const handleSubmit = async () => {
    if (overallStars === 0) return;
    setError(null);
    try {
      await rateReservation.mutateAsync({
        reservationId: id,
        overallStars,
        foodQuality: foodQuality > 0 ? foodQuality : undefined,
        service: service > 0 ? service : undefined,
        comment: comment.trim().length > 0 ? comment.trim() : undefined,
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof KurtarApiError && err.errorCode === "RATING_ALREADY_EXISTS") {
        setAlreadyRated(true);
      } else {
        setError(getErrorMessage(err, t));
      }
    }
  };

  if (reservationsQuery.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (submitted) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Ionicons name="heart" size={56} color={colors.primary[500]} />
          <Text style={styles.title}>{t("rate.thanksTitle")}</Text>
          <Text style={styles.body}>{t("rate.thanksBody")}</Text>
          <Button label={t("common.ok")} onPress={() => router.replace("/(tabs)/orders")} />
        </View>
      </Screen>
    );
  }

  if (alreadyRated) {
    return (
      <Screen>
        <EmptyState icon="star" title={t("rate.alreadyRated")} />
      </Screen>
    );
  }

  if (!reservation || reservation.status !== "REDEEMED") {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title={t("errors.RATING_NOT_ELIGIBLE")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>{t("rate.title")}</Text>

        <View style={styles.starRow}>
          <Text style={styles.starLabel}>{t("rate.overall")}</Text>
          <StarRating value={overallStars} onChange={setOverallStars} label={t("rate.overall")} />
        </View>

        <View style={styles.starRow}>
          <Text style={styles.starLabel}>{t("rate.foodQuality")}</Text>
          <StarRating
            value={foodQuality}
            onChange={setFoodQuality}
            size={24}
            label={t("rate.foodQuality")}
          />
        </View>

        <View style={styles.starRow}>
          <Text style={styles.starLabel}>{t("rate.service")}</Text>
          <StarRating value={service} onChange={setService} size={24} label={t("rate.service")} />
        </View>

        <TextInput
          style={styles.commentInput}
          placeholder={t("rate.commentPlaceholder")}
          placeholderTextColor={colors.neutral[400]}
          value={comment}
          onChangeText={setComment}
          multiline
          accessibilityLabel={t("rate.commentPlaceholder")}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={t("rate.submit")}
          onPress={handleSubmit}
          disabled={overallStars === 0}
          loading={rateReservation.isPending}
        />
        <Button label={t("rate.skip")} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  title: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
    textAlign: "center",
  },
  body: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
    textAlign: "center",
  },
  starRow: {
    alignItems: "center",
    gap: spacing.xs,
  },
  starLabel: {
    fontSize: typeScale.label.size,
    color: colors.neutral[600],
  },
  commentInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: typeScale.body.size,
    color: colors.neutral[900],
    textAlignVertical: "top",
  },
  error: {
    fontSize: typeScale.caption.size,
    color: colors.semantic.danger[500],
    textAlign: "center",
  },
});
