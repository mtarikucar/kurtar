import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePalet } from "../design/theme";
import { m, s } from "../design/tokens";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  label: string;
  /** Set when the row sits on a card rather than on the street, so the
   * unlit stars take the card's secondary ink instead of the ground's. */
  kartUstunde?: boolean;
}

/**
 * A rating is light: a lit star is sodium, an unlit one is the mist ink,
 * and neither is ever a second hue. Interactive when `onChange` is passed
 * (the rating screen), a read-only display otherwise (store profile).
 *
 * Each star is its own 44pt touch target with a distinct accessibility
 * label ("2 yıldız ver") rather than one opaque 5-star strip.
 */
export function StarRating({
  value,
  onChange,
  size = 32,
  label,
  kartUstunde = false,
}: StarRatingProps) {
  const palet = usePalet();
  const yildizlar = [1, 2, 3, 4, 5];
  const sonuk = kartUstunde ? palet.yaziSis : palet.yaziSisZemin;

  return (
    <View
      style={styles.satir}
      accessibilityRole={onChange ? "adjustable" : "text"}
      accessibilityLabel={`${label}: ${value}/5`}
    >
      {yildizlar.map((yildiz) =>
        onChange ? (
          <Pressable
            key={yildiz}
            onPress={() => onChange(yildiz)}
            accessibilityRole="button"
            accessibilityLabel={`${yildiz} yıldız ver`}
            hitSlop={6}
            style={({ pressed }) => [
              styles.hedef,
              pressed ? { opacity: m.pressOpacity } : null,
            ]}
          >
            <Ionicons
              name={yildiz <= value ? "star" : "star-outline"}
              size={size}
              color={yildiz <= value ? palet.sodyumYazi : sonuk}
            />
          </Pressable>
        ) : (
          <Ionicons
            key={yildiz}
            name={yildiz <= value ? "star" : "star-outline"}
            size={size}
            color={yildiz <= value ? palet.sodyumYazi : sonuk}
          />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  satir: { flexDirection: "row", gap: s.s1 },
  hedef: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
