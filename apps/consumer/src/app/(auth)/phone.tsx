import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
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

export default function PhoneScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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
      <View style={styles.content}>
        <Text style={styles.brand}>kurtar</Text>
        <Text style={styles.title}>{t("auth.phone.title")}</Text>
        <Text style={styles.subtitle}>{t("auth.phone.subtitle")}</Text>

        <TextField
          label={t("auth.phone.placeholder")}
          placeholder={t("auth.phone.placeholder")}
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

        <Text style={styles.legalHint}>{t("auth.phone.legalHint")}</Text>
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
  brand: {
    fontSize: typeScale.display.size,
    fontWeight: typeScale.display.weight,
    color: colors.primary[500],
  },
  title: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
  },
  subtitle: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
  },
  legalHint: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[500],
    textAlign: "center",
  },
});
