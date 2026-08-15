import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { IconButton } from "../../components/IconButton";
import { Chip } from "../../components/Chip";

const DOCS = ["terms", "privacy", "distanceSales"] as const;
type LegalDoc = (typeof DOCS)[number];

/**
 * Placeholder legal-text viewer — the brief lists "legal texts" as a
 * profile menu destination; the actual approved copy (Terms of Use,
 * Privacy Policy, Distance Sales Agreement) is a legal/product deliverable
 * this task cannot author. Structured so real copy is a content-only drop
 * -in later (one string per doc), not a re-architecture.
 */
export default function LegalDocScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const active: LegalDoc = DOCS.includes(doc as LegalDoc) ? (doc as LegalDoc) : "terms";

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="chevron-back"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>{t("legal.title")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.chipRow}>
        {DOCS.map((d) => (
          <Chip
            key={d}
            label={t(`legal.${d}`)}
            selected={active === d}
            onPress={() => router.setParams({ doc: d })}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.docTitle}>{t(`legal.${active}`)}</Text>
        <Text style={styles.docBody}>{t("legal.placeholderBody")}</Text>
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: 20,
    paddingBottom: spacing.sm,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: spacing["3xl"],
    gap: spacing.md,
  },
  docTitle: {
    fontSize: typeScale.h2.size,
    fontWeight: typeScale.h2.weight,
    color: colors.neutral[900],
  },
  docBody: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
    lineHeight: 22,
  },
});
