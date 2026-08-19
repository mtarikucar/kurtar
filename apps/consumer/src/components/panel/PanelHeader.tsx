import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";

const HEDEF_GENISLIK = 44;

/**
 * The stacked-screen header every Track C detail/settings surface shares:
 * a 44pt back/close target, the `title` token (Archivo 600 — spec §1.2
 * marks `title` as sentence case, unlike `tabela`/`label`, so this never
 * runs the title through `trUpper()`), and an optional right-hand slot so
 * a screen can hang one more control there without re-deriving the row.
 */
export function PanelHeader({
  title,
  onBack,
  backIcon = "chevron-back",
  backLabel,
  sag,
}: {
  title: string;
  onBack: () => void;
  backIcon?: "chevron-back" | "close";
  backLabel: string;
  sag?: ReactNode;
}) {
  const palet = usePalet();
  return (
    <View style={styles.satir}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        hitSlop={8}
        style={({ pressed }) => [styles.hedef, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name={backIcon} size={22} color={palet.yaziAna} />
      </Pressable>
      <Text
        style={[yazi.title, styles.baslik, { color: palet.yaziAna }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
      >
        {title}
      </Text>
      <View style={styles.hedef}>{sag}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  satir: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: s.s2,
    paddingVertical: s.s2,
  },
  hedef: {
    width: HEDEF_GENISLIK,
    height: HEDEF_GENISLIK,
    alignItems: "center",
    justifyContent: "center",
  },
  baslik: {
    flex: 1,
    textAlign: "center",
  },
});
