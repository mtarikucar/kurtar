import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";

/** The label sits on the screen's ground; the field paints its own
 * `yuzeyKaldirim`, so the placeholder and the entered text are card type.
 * One component, two surfaces — this is the split the palette exists for. */
export function PanelTextArea({
  label,
  style,
  ...girisOzellikleri
}: TextInputProps & { label: string }) {
  const palet = usePalet();
  return (
    <View style={styles.kap}>
      <Text style={[yazi.label, { color: palet.yaziSisZemin }]}>{label}</Text>
      <TextInput
        {...girisOzellikleri}
        accessibilityLabel={label}
        placeholderTextColor={palet.yaziSis}
        style={[
          yazi.body,
          styles.giris,
          {
            backgroundColor: palet.yuzeyKaldirim,
            borderColor: palet.cizgiKil,
            color: palet.yaziAna,
          },
          style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { gap: s.s2 },
  giris: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: r.card,
    padding: s.s4,
    textAlignVertical: "top",
  },
});
