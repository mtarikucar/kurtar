import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import { PanelButton } from "./PanelButton";

export function PanelErrorState({
  title,
  body,
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  return (
    <View style={styles.kap}>
      <Ionicons name="cloud-offline-outline" size={36} color={palet.yaziSisZemin} />
      <Text style={[yazi.title, styles.baslik, { color: palet.yaziAnaZemin }]}>
        {title ?? t("discover.errorTitle")}
      </Text>
      <Text style={[yazi.body, styles.govde, { color: palet.yaziSisZemin }]}>
        {body ?? t("discover.errorBody")}
      </Text>
      {onRetry ? (
        <View style={styles.cta}>
          <PanelButton label={t("common.retry")} onPress={onRetry} />
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
