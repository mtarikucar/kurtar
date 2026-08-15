import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { colors } from "@kurtar/ui-tokens";
import type { ReactNode } from "react";

interface ScreenProps {
  children: ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  /** For screens that own their own scroll/list (avoids double-scroll containers). */
  padded?: boolean;
}

/** Base screen wrapper — consistent background + safe-area handling for
 * every route. Kept deliberately dumb (no scroll behavior of its own) so
 * screens with a FlatList/ScrollView compose cleanly underneath it. */
export function Screen({ children, edges, style, padded = true }: ScreenProps) {
  return (
    <SafeAreaView
      edges={edges ?? ["top", "left", "right"]}
      style={[styles.safe, style]}
    >
      <View style={[styles.content, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: 20,
  },
});
