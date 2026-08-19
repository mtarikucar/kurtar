import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";

export function PanelLoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  const palet = usePalet();
  return (
    <View style={styles.kap} accessibilityRole="progressbar">
      <ActivityIndicator color={palet.sodyumDolgu} size="large" />
      <Text style={[yazi.body, { color: palet.yaziSisZemin }]}>{label ?? t("common.loading")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { flex: 1, alignItems: "center", justifyContent: "center", gap: s.s2 },
});
