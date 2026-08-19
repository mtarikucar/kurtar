import { Pressable, StyleSheet, Text } from "react-native";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";

/** A filter chip. Unselected it is transparent, so its label is on
 * whatever is behind it — and both callers (complaint/new, legal/[doc])
 * put it straight on the `<PanelScreen/>` ground. */
export function PanelChip({
  label,
  secili,
  onPress,
}: {
  label: string;
  secili?: boolean;
  onPress: () => void;
}) {
  const palet = usePalet();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!secili }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.taban,
        {
          backgroundColor: secili ? palet.sodyumDolgu : "transparent",
          borderColor: secili ? palet.sodyumDolgu : palet.cizgiKil,
        },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text
        style={[
          yazi.data,
          { color: secili ? palet.sodyumMurekkep : palet.yaziSisZemin },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  taban: {
    minHeight: 44,
    paddingHorizontal: s.s4,
    borderRadius: r.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
