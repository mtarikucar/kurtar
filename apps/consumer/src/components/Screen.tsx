import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { usePalet } from "@/design/theme";

interface ScreenProps {
  children: ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  /** For screens that own their own scroll/list (avoids double-scroll containers). */
  padded?: boolean;
}

/** Base screen wrapper — the street's ground + safe-area handling for every
 * route. The ground follows the phase (spec §1.1): a screen that painted a
 * fixed pale background sat under night type and made it unreadable, so the
 * background is read from the palette, never hardcoded. Kept deliberately
 * dumb (no scroll behavior of its own) so screens with a FlatList/ScrollView
 * compose cleanly underneath it. */
export function Screen({ children, edges, style, padded = true }: ScreenProps) {
  const palet = usePalet();
  return (
    <SafeAreaView
      edges={edges ?? ["top", "left", "right"]}
      style={[styles.safe, { backgroundColor: palet.bgAsfalt }, style]}
    >
      <View style={[styles.content, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: 20,
  },
});
