import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import { PanelButton } from "./PanelButton";

export function PanelEmptyState({
  icon = "leaf-outline",
  title,
  body,
  ctaLabel,
  onPressCta,
}: {
  icon?: ComponentProps<typeof Ionicons>["name"];
  title: string;
  body?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
}) {
  const palet = usePalet();
  return (
    <View style={styles.kap}>
      <Ionicons name={icon} size={36} color={palet.yaziSis} />
      <Text style={[yazi.title, styles.baslik, { color: palet.yaziAna }]}>{title}</Text>
      {body ? (
        <Text style={[yazi.body, styles.govde, { color: palet.yaziSis }]}>{body}</Text>
      ) : null}
      {ctaLabel && onPressCta ? (
        <View style={styles.cta}>
          <PanelButton label={ctaLabel} onPress={onPressCta} varyant="hayalet" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s.s8,
    gap: s.s2,
  },
  baslik: { textAlign: "center", marginTop: s.s2 },
  govde: { textAlign: "center" },
  cta: { marginTop: s.s4 },
});
