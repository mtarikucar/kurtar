import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { StarRating } from "../../components/StarRating";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";
import { useReservations, useRateReservation } from "../../hooks/use-reservations";
import { getErrorMessage } from "../../lib/errors";
import { KurtarApiError } from "@kurtar/api-client";

/**
 * DEĞERLENDİR — rate a redeemed order.
 *
 * A rating is light, so the lit stars are sodium and the thanks screen is
 * a sodium mark rather than a coloured tick; there is no green anywhere
 * in this app (§5.9). The comment box is the same recessed slot every
 * other input in the app is, on the card surface with the painted
 * chassis — never a white sheet.
 */
export default function RateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
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
        <View style={styles.ortalanmis}>
          <Ionicons name="heart" size={48} color={palet.sodyumYazi} />
          <Text style={[yazi.title, styles.baslik, { color: palet.yaziAnaZemin }]}>
            {t("rate.thanksTitle")}
          </Text>
          <Text style={[yazi.body, styles.govde, { color: palet.yaziSisZemin }]}>
            {t("rate.thanksBody")}
          </Text>
          <Button
            label={t("common.ok")}
            onPress={() => router.replace("/(tabs)/orders")}
            style={styles.tamButonu}
          />
        </View>
      </Screen>
    );
  }

  if (alreadyRated) {
    return (
      <Screen>
        <EmptyState
          icon="star"
          title={t("rate.alreadyRated")}
          ctaLabel={t("common.ok")}
          onPressCta={() => router.replace("/(tabs)/orders")}
        />
      </Screen>
    );
  }

  if (!reservation || reservation.status !== "REDEEMED") {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t("errors.RATING_NOT_ELIGIBLE")}
          ctaLabel={t("common.back")}
          onPressCta={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.icerik}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[yazi.title, styles.ustBaslik, { color: palet.yaziAnaZemin }]}>
          {t("rate.title")}
        </Text>

        <YildizSatiri etiket={t("rate.overall")}>
          <StarRating value={overallStars} onChange={setOverallStars} label={t("rate.overall")} />
        </YildizSatiri>

        <YildizSatiri etiket={t("rate.foodQuality")}>
          <StarRating
            value={foodQuality}
            onChange={setFoodQuality}
            size={24}
            label={t("rate.foodQuality")}
          />
        </YildizSatiri>

        <YildizSatiri etiket={t("rate.service")}>
          <StarRating
            value={service}
            onChange={setService}
            size={24}
            label={t("rate.service")}
          />
        </YildizSatiri>

        <TextInput
          style={[
            yazi.body,
            styles.yorum,
            {
              backgroundColor: palet.yuzeyKaldirim,
              borderColor: palet.cizgiKil,
              borderTopColor: palet.kartUstIsik,
              borderBottomColor: palet.kartAltTemas,
              color: palet.yaziAna,
            },
          ]}
          placeholder={t("rate.commentPlaceholder")}
          placeholderTextColor={palet.yaziSis}
          value={comment}
          onChangeText={setComment}
          multiline
          accessibilityLabel={t("rate.commentPlaceholder")}
        />

        {error ? (
          <View style={[styles.uyari, { backgroundColor: palet.tenteDolgu }]}>
            <Text style={[yazi.data, { color: palet.tenteMurekkep }]} maxFontSizeMultiplier={1.3}>
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          label={t("rate.submit")}
          onPress={handleSubmit}
          disabled={overallStars === 0}
          loading={rateReservation.isPending}
        />
        <Button label={t("rate.skip")} varyant="hayalet" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

function YildizSatiri({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  const palet = usePalet();
  return (
    <View style={styles.yildizSatiri}>
      <Text style={[yazi.label, { color: palet.yaziSisZemin }]} maxFontSizeMultiplier={1.4}>
        {etiket}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  icerik: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: s.s6,
    gap: s.s4,
  },
  ortalanmis: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: s.s3,
  },
  ustBaslik: { textAlign: "center" },
  baslik: { textAlign: "center" },
  govde: { textAlign: "center" },
  tamButonu: { marginTop: s.s4, alignSelf: "stretch" },
  yildizSatiri: { alignItems: "center", gap: s.s1 },
  yorum: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: r.card,
    padding: s.s4,
    textAlignVertical: "top",
    elevation: 0,
  },
  uyari: {
    alignSelf: "center",
    borderRadius: r.plaque,
    paddingHorizontal: s.s3,
    paddingVertical: s.s2,
  },
});
