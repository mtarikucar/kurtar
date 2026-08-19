import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { usePalet } from "../design/theme";
import { s, yazi } from "../design/tokens";

/**
 * No shimmer, ever (§4.8): masked-view plus an animated gradient is the
 * most reliably janky component in React Native and always looks cheap.
 * The street's own loading state is a row of closed shutters
 * (`kesif/SokakYukleniyor`, `teslim/DurumEkrani`); this is the plain
 * spinner for the route-level waits that have no street to draw — the
 * session bootstrap, a modal fetching one record — and it is a sodium
 * lamp on the asphalt with the caption in the ground's own ink.
 */
export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  const palet = usePalet();
  return (
    <View style={styles.kap} accessibilityRole="progressbar">
      <ActivityIndicator color={palet.sodyumDolgu} size="large" />
      <Text style={[yazi.body, { color: palet.yaziSisZemin }]}>
        {label ?? t("common.loading")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { flex: 1, alignItems: "center", justifyContent: "center", gap: s.s2 },
});
