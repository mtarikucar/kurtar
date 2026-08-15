import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { useTranslation } from "react-i18next";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.primary[500]} size="large" />
      <Text style={styles.label}>{label ?? t("common.loading")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  label: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
  },
});
