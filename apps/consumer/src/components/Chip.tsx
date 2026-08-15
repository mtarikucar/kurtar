import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}

/** A single filter/category toggle chip — used for category & diet filters
 * and search shortcuts. `selected` drives both visual state and the
 * accessibility "selected" state so a screen reader announces it. */
export function Chip({ label, selected, onPress, testID }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neutral[100],
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  selected: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[500],
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: typeScale.caption.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[700],
  },
  labelSelected: {
    color: colors.primary[700],
  },
});
