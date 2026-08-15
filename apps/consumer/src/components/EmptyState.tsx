import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import type { ComponentProps } from "react";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: ComponentProps<typeof Ionicons>["name"];
  title: string;
  body?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
}

/** Shared empty-state layout — every list screen (discovery, search,
 * favorites, orders) renders one of these instead of a blank view, always
 * with Turkish copy that tells the user what to do next. */
export function EmptyState({
  icon = "leaf-outline",
  title,
  body,
  ctaLabel,
  onPressCta,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={40} color={colors.neutral[400]} />
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {ctaLabel && onPressCta ? (
        <Button
          label={ctaLabel}
          onPress={onPressCta}
          variant="secondary"
          style={styles.cta}
        />
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
