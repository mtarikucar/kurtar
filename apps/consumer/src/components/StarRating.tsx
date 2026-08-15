import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@kurtar/ui-tokens";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  label: string;
}

/** Interactive when `onChange` is passed (the rating screen), read-only
 * display otherwise (store profile / offer detail rating summary). Each
 * star is its own 44pt-tall touch target with a distinct accessibility
 * label ("2 yıldız ver") rather than one opaque 5-star strip. */
export function StarRating({ value, onChange, size = 32, label }: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <View
      style={styles.row}
      accessibilityRole={onChange ? "adjustable" : "text"}
      accessibilityLabel={`${label}: ${value}/5`}
    >
      {stars.map((star) =>
        onChange ? (
          <Pressable
            key={star}
            onPress={() => onChange(star)}
            accessibilityRole="button"
            accessibilityLabel={`${star} yıldız ver`}
            hitSlop={6}
            style={styles.touchTarget}
          >
            <Ionicons
              name={star <= value ? "star" : "star-outline"}
              size={size}
              color={colors.primary[500]}
            />
          </Pressable>
        ) : (
          <Ionicons
            key={star}
            name={star <= value ? "star" : "star-outline"}
            size={size}
            color={colors.primary[500]}
          />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 4,
  },
  touchTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
