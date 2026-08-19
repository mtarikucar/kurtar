import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { usePalet } from "../../design/theme";
import { s } from "../../design/tokens";

/**
 * The kepenk-palette screen chassis for Track C's surfaces (orders,
 * profile, settings, complaints, legal). A local sibling to
 * `components/Screen.tsx` rather than a change to it — that file backs
 * every other tab (discovery, map, favorites, purchase, redeem), which
 * the other two tracks are actively building against; this one only ever
 * mounts under routes this track owns.
 */
export function PanelScreen({
  children,
  edges,
  padded = true,
}: {
  children: ReactNode;
  edges?: Edge[];
  /** For screens that own their own scroll/list (avoids double-scroll
   * containers) — mirrors Screen.tsx's own `padded` contract. */
  padded?: boolean;
}) {
  const palet = usePalet();
  return (
    <SafeAreaView
      edges={edges ?? ["top", "left", "right"]}
      style={[styles.safe, { backgroundColor: palet.bgAsfalt }]}
    >
      <View style={[styles.content, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1 },
  padded: { paddingHorizontal: s.s4 },
});
