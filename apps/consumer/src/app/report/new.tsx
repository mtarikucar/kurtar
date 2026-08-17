import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { IconButton } from "../../components/IconButton";
import { Button } from "../../components/Button";
import { useCreateReport } from "../../hooks/use-reports";
import { getErrorMessage } from "../../lib/errors";

/**
 * [I14 fix] The 48h notice-and-takedown entry point (backend/src/modules/
 * moderation) — distinct from complaint/new.tsx's per-reservation
 * complaint. Reached from a "Bildir" affordance on the offer detail and
 * store profile screens, each passing its own targetType/targetId.
 */
export default function NewReportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { targetType, targetId } = useLocalSearchParams<{
    targetType: "STORE" | "OFFER" | "RATING";
    targetId: string;
  }>();
  const createReport = useCreateReport();

  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!targetType || !targetId || reason.trim().length === 0) return;
    setError(null);
    try {
      await createReport.mutateAsync({
        targetType,
        targetId,
        reason: reason.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err, t));
    }
  };

  if (submitted) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle" size={56} color={colors.secondary[500]} />
          <Text style={styles.submittedText}>{t("report.submitted")}</Text>
          <Button label={t("common.ok")} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="close"
          accessibilityLabel={t("common.close")}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>
          {t(`report.title.${targetType ?? "OFFER"}`)}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>{t("report.reason")}</Text>
        <TextInput
          style={styles.textInput}
          placeholder={t("report.reasonPlaceholder")}
          placeholderTextColor={colors.neutral[400]}
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={2000}
          accessibilityLabel={t("report.reason")}
          testID="report-reason-input"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={t("report.submit")}
          onPress={handleSubmit}
          disabled={reason.trim().length === 0}
          loading={createReport.isPending}
          testID="report-submit"
        />
      </ScrollView>
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
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: typeScale.label.size,
    fontWeight: typeScale.label.weight,
    color: colors.neutral[600],
  },
  textInput: {
    minHeight: 120,
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
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  submittedText: {
    fontSize: typeScale.body.size,
    color: colors.neutral[700],
    textAlign: "center",
  },
});
