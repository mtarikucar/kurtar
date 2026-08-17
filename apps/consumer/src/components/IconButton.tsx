import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "@kurtar/ui-tokens";
import type { ComponentProps } from "react";

interface IconButtonProps {
  name: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  /** REQUIRED, not optional — an icon-only button with no accessibilityLabel
   * is an unlabeled control for a screen-reader user (task brief's a11y
   * requirement: "screen-reader labels on ... all icon-only buttons"). */
  accessibilityLabel: string;
  size?: number;
  color?: string;
  variant?: "plain" | "filled";
  disabled?: boolean;
  testID?: string;
}

/** A 44x44pt-minimum touch target wrapping a single icon glyph. Always
 * pass a human-meaningful accessibilityLabel describing the ACTION ("Kapat",
 * "Favorilere ekle"), never the icon's visual name. */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  size = 22,
  color,
  variant = "plain",
  disabled,
  testID,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        variant === "filled" && styles.filled,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Ionicons
        name={name}
        size={size}
        color={color ?? (variant === "filled" ? colors.neutral[0] : colors.neutral[800])}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
  },
  filled: {
    backgroundColor: colors.neutral[900],
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.4,
  },
});
