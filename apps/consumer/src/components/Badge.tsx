import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";

interface BadgeProps {
  label: string;
  tone?: "brand" | "success" | "warning" | "neutral";
}

export function Badge({ label, tone = "brand" }: BadgeProps) {
  return (
    <View style={[styles.base, toneStyles[tone].container]}>
      <Text style={[styles.label, toneStyles[tone].label]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  label: {
    fontSize: typeScale.label.size,
    fontWeight: typeScale.label.weight,
  },
});

const toneStyles = {
  brand: {
    container: { backgroundColor: colors.primary[50] },
    label: { color: colors.primary[700] },
  },
  success: {
    container: { backgroundColor: colors.secondary[50] },
    label: { color: colors.secondary[700] },
  },
  warning: {
    container: { backgroundColor: colors.semantic.warning[50] },
    label: { color: colors.semantic.warning[700] },
  },
  neutral: {
    container: { backgroundColor: colors.neutral[100] },
    label: { color: colors.neutral[700] },
  },
} as const;
