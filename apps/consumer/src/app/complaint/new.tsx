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
import { PanelChip } from "../../components/panel/PanelChip";
import { PanelTextArea } from "../../components/panel/PanelTextArea";
import { useCreateComplaint } from "../../hooks/use-complaints";
import { getErrorMessage } from "../../lib/errors";

const CATEGORIES = [
  "FOOD_QUALITY",
  "MISSING_ITEMS",
  "WRONG_ITEMS",
  "STORE_CLOSED_NO_SHOW",
  "RUDE_STAFF",
  "PAYMENT_BILLING",
  "SAFETY_HYGIENE",
  "OTHER",
] as const;

export default function NewComplaintScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const { reservationId } = useLocalSearchParams<{ reservationId?: string }>();
  const createComplaint = useCreateComplaint();

  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!category || description.trim().length === 0) return;
    setError(null);
    try {
      await createComplaint.mutateAsync({
        category,
        description: description.trim(),
        reservationId: reservationId || undefined,
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
            {t("complaint.submitted")}
          </Text>
          <PanelButton label={t("common.ok")} onPress={() => router.back()} />
        </View>
      </PanelScreen>
    );
  }

  return (
    <PanelScreen padded={false}>
      <PanelHeader
        title={t("complaint.title")}
        onBack={() => router.back()}
        backIcon="close"
        backLabel={t("common.close")}
      />

      <ScrollView contentContainerStyle={styles.icerik}>
        <Text style={[yazi.label, { color: palet.yaziSisZemin }]}>{t("complaint.category")}</Text>
        <View style={styles.cipSatiri}>
          {CATEGORIES.map((c) => (
            <PanelChip
              key={c}
              label={t(`complaint.categories.${c}`)}
              secili={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>

        <PanelTextArea
          label={t("complaint.description")}
          placeholder={t("complaint.descriptionPlaceholder")}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        {error ? (
          <Text style={[yazi.data, styles.hata, { color: palet.tenteMurekkep }]}>{error}</Text>
        ) : null}

        <PanelButton
          label={t("complaint.submit")}
          onPress={handleSubmit}
          disabled={!category || description.trim().length === 0}
          loading={createComplaint.isPending}
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
  cipSatiri: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: s.s2,
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
