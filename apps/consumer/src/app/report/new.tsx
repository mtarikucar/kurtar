import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import { PanelScreen } from "../../components/panel/PanelScreen";
import { PanelHeader } from "../../components/panel/PanelHeader";
import { PanelButton } from "../../components/panel/PanelButton";
import { PanelTextArea } from "../../components/panel/PanelTextArea";
import { useCreateReport } from "../../hooks/use-reports";
import { getErrorMessage } from "../../lib/errors";

/**
 * The 48h notice-and-takedown entry point — distinct from complaint/
 * new.tsx's per-reservation complaint. Reached from a "Bildir" affordance
 * on offer detail / store profile (Track A's surfaces), each passing its
 * own targetType/targetId.
 */
export default function NewReportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const { targetType, targetId } = useLocalSearchParams<{
    targetType: "STORE" | "OFFER" | "RATING";
    targetId: string;
  }>();
  const createReport = useCreateReport();

  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!targetType || !targetId || reason.trim().length === 0) return;
    setError(null);
    try {
      await createReport.mutateAsync({
        targetType,
        targetId,
        reason: reason.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err, t));
    }
  };

  if (submitted) {
    return (
      <PanelScreen>
        <View style={styles.ortali}>
          <Ionicons name="checkmark-circle" size={56} color={palet.sodyumDolgu} />
          <Text style={[yazi.body, styles.gonderildiMetni, { color: palet.yaziAnaZemin }]}>
            {t("report.submitted")}
          </Text>
          <PanelButton label={t("common.ok")} onPress={() => router.back()} />
        </View>
      </PanelScreen>
    );
  }

  return (
    <PanelScreen padded={false}>
      <PanelHeader
        title={t(`report.title.${targetType ?? "OFFER"}`)}
        onBack={() => router.back()}
        backIcon="close"
        backLabel={t("common.close")}
      />

      <ScrollView contentContainerStyle={styles.icerik}>
        <PanelTextArea
          label={t("report.reason")}
          placeholder={t("report.reasonPlaceholder")}
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={2000}
          testID="report-reason-input"
        />

        {error ? (
          <Text style={[yazi.data, styles.hata, { color: palet.tenteMurekkep }]}>{error}</Text>
        ) : null}

        <PanelButton
          label={t("report.submit")}
          onPress={handleSubmit}
          disabled={reason.trim().length === 0}
          loading={createReport.isPending}
          testID="report-submit"
        />
      </ScrollView>
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  icerik: {
    paddingHorizontal: s.s4,
    paddingBottom: s.s10,
    gap: s.s4,
  },
  hata: { textAlign: "center" },
  ortali: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: s.s4,
  },
  gonderildiMetni: { textAlign: "center" },
});
