import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  body?: string;
  onRetry?: () => void;
}

/** Shared error-state layout with a retry CTA — used whenever a query
 * fails outright (as opposed to a business-rule empty result, which uses
 * EmptyState instead). */
export function ErrorState({ title, body, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.semantic.danger[500]} />
      <Text style={styles.title}>{title ?? t("discover.errorTitle")}</Text>
      <Text style={styles.body}>{body ?? t("discover.errorBody")}</Text>
      {onRetry ? (
        <Button label={t("common.retry")} onPress={onRetry} style={styles.cta} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing["2xl"],
    gap: spacing.sm,
  },
  title: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.neutral[900],
    textAlign: "center",
    marginTop: spacing.sm,
  },
  body: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
    textAlign: "center",
  },
  cta: {
    marginTop: spacing.md,
  },
});
