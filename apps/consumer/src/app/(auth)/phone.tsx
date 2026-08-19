import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../components/Screen";
import { GirisCephesi } from "../../components/GirisCephesi";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import { useAuth } from "../../lib/auth-context";
import { getErrorMessage } from "../../lib/errors";

/** A light client-side sanity check only — the backend's own NormalizePhone
 * (libphonenumber-js, region TR) is the real validator and accepts any
 * natural format ("0555 123 45 67", "555 123 45 67", "+90555..."). This
 * just avoids an obviously-empty/too-short submit round-tripping to the
 * server for nothing. */
function looksLikePhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10;
}

/**
 * The first screen anyone sees. It opens with the app's own storefront
 * rather than a wordmark, so the offer card is already familiar by the
 * time discovery loads.
 */
export default function PhoneScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const { requestOtp } = useAuth();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);


  const handleSubmit = async () => {
    if (!looksLikePhone(phone)) {
      setError(t("auth.phone.invalid"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await requestOtp(phone);
      router.push({ pathname: "/(auth)/otp", params: { phone } });
    } catch (err) {
      setError(getErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.icerik}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <GirisCephesi />

        <Text style={[yazi.title, styles.baslik, { color: palet.yaziAnaZemin }]}>
          {t("auth.phone.title")}
        </Text>
        <Text style={[yazi.body, styles.altBaslik, { color: palet.yaziSisZemin }]}>
          {t("auth.phone.subtitle")}
        </Text>

        <View style={styles.form}>
          <TextField
            label={t("auth.phone.placeholder")}
            placeholder={t("auth.phone.placeholder")}
            etiketGizli
            value={phone}
            onChangeText={(value) => {
              setPhone(value);
              if (error) setError(null);
            }}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            error={error ?? undefined}
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
          />

          <Button
            label={t("auth.phone.cta")}
            onPress={handleSubmit}
            loading={submitting}
            disabled={phone.length === 0}
            testID="phone-submit"
          />
        </View>

        <Text style={[yazi.micro, styles.yasal, { color: palet.yaziSisZemin }]}>
          {t("auth.phone.legalHint")}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icerik: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: s.s6,
    gap: s.s3,
  },
  baslik: { marginTop: s.s5 },
  altBaslik: {},
  form: { marginTop: s.s3, gap: s.s4 },
  yasal: { marginTop: s.s3, textAlign: "center" },
});
