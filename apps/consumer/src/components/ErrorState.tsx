import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { usePalet } from "../design/theme";
import { s, yazi } from "../design/tokens";
import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  body?: string;
  onRetry?: () => void;
}

/**
 * A failed query, on the ground's own inks and with a retry that is the
 * page's primary action — the user is stuck and the only thing worth
 * offering is the way out. Used whenever a query fails outright, as
 * opposed to a business-rule empty result, which uses EmptyState.
 */
export function ErrorState({ title, body, onRetry }: ErrorStateProps) {
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
          <Button label={t("common.retry")} onPress={onRetry} />
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
  cta: { marginTop: s.s4, alignSelf: "stretch" },
});
