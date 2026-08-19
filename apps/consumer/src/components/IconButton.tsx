import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { usePalet } from "../design/theme";
import { m, r } from "../design/tokens";

interface IconButtonProps {
  name: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  /** REQUIRED, not optional — an icon-only button with no accessibilityLabel
   * is an unlabeled control for a screen-reader user. */
  accessibilityLabel: string;
  size?: number;
  color?: string;
  /** `dolu` gives it the card surface to stand on, for a control that
   * sits over artwork rather than over the ground. */
  varyant?: "duz" | "dolu";
  /** The one lit state this control has: a favourited heart. Sodium,
   * never red and never green — light is how this app says yes. */
  yanik?: boolean;
  disabled?: boolean;
  testID?: string;
}

/**
 * A 44×44pt-minimum touch target around a single glyph, drawn in the
 * ground's own primary ink so it survives the phase inversion. Always
 * pass a human-meaningful accessibilityLabel describing the ACTION
 * ("Kapat", "Favorilere ekle"), never the icon's visual name.
 *
 * Radius is `r.cta`, not a pill: nothing in this app is pill-shaped
 * except the time pill and the chips (§1.3).
 */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  size = 22,
  color,
  varyant = "duz",
  yanik = false,
  disabled,
  testID,
}: IconButtonProps) {
  const palet = usePalet();
  const renk = color ?? (yanik ? palet.sodyumYazi : palet.yaziAnaZemin);

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
        styles.taban,
        varyant === "dolu"
          ? {
              backgroundColor: palet.yuzeyKaldirim,
              borderColor: palet.cizgiKil,
              borderWidth: 1,
            }
          : null,
        pressed ? { opacity: m.pressOpacity } : null,
        disabled ? styles.kapali : null,
      ]}
    >
      <Ionicons name={name} size={size} color={renk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  taban: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: r.cta,
    elevation: 0,
  },
  kapali: { opacity: 0.4 },
});
