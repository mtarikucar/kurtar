import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { IconButton } from "../../components/IconButton";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { useCreateComplaint } from "../../hooks/use-complaints";
import { getErrorMessage } from "../../lib/errors";

const CATEGORIES = [
  "FOOD_QUALITY",
  "MISSING_ITEMS",
  "WRONG_ITEMS",
  "STORE_CLOSED_NO_SHOW",
  "RUDE_STAFF",
  "PAYMENT_BILLING",
  "SAFETY_HYGIENE",
  "OTHER",
] as const;

export default function NewComplaintScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { reservationId } = useLocalSearchParams<{ reservationId?: string }>();
  const createComplaint = useCreateComplaint();

  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!category || description.trim().length === 0) return;
    setError(null);
    try {
      await createComplaint.mutateAsync({
        category,
        description: description.trim(),
        reservationId: reservationId || undefined,
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
          <Text style={styles.submittedText}>{t("complaint.submitted")}</Text>
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
        <Text style={styles.headerTitle}>{t("complaint.title")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>{t("complaint.category")}</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={t(`complaint.categories.${c}`)}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>

        <Text style={styles.sectionLabel}>{t("complaint.description")}</Text>
        <TextInput
          style={styles.textInput}
          placeholder={t("complaint.descriptionPlaceholder")}
          placeholderTextColor={colors.neutral[400]}
          value={description}
          onChangeText={setDescription}
          multiline
          accessibilityLabel={t("complaint.description")}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={t("complaint.submit")}
          onPress={handleSubmit}
          disabled={!category || description.trim().length === 0}
          loading={createComplaint.isPending}
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
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
