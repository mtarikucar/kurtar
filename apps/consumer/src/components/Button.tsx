import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

/** Primary CTA primitive — 48pt min height (comfortably above the 44pt a11y
 * target), disabled+loading both block onPress, loading swaps the label
 * for a spinner without changing the button's height (avoids layout jump
 * on the purchase/redeem flows where this matters most). */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColorFor(variant)} />
      ) : (
        <Text style={[styles.label, { color: textColorFor(variant) }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function textColorFor(variant: Variant): string {
  if (variant === "ghost") return colors.primary[500];
  if (variant === "secondary") return colors.neutral[900];
  return colors.neutral[0];
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    flexDirection: "row",
  },
  label: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.primary[500] },
  secondary: { backgroundColor: colors.neutral[100] },
  danger: { backgroundColor: colors.semantic.danger[500] },
  ghost: { backgroundColor: "transparent" },
};
