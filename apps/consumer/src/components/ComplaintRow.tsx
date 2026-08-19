import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { usePalet } from "../design/theme";
import { r, s, yazi } from "../design/tokens";
import { PanelPill } from "./panel/PanelPill";
import { formatShortDate } from "../lib/format";

export interface ComplaintListItem {
  id: string;
  category: string;
  description: string;
  status: "OPEN" | "MERCHANT_RESPONDED" | "RESOLVED" | "ESCALATED";
  slaDeadlineAt: string;
  resolvedAt?: string | null;
}

const DURUM_TONU: Record<ComplaintListItem["status"], "notr" | "sodyum" | "tente"> = {
  OPEN: "tente",
  MERCHANT_RESPONDED: "sodyum",
  RESOLVED: "sodyum",
  ESCALATED: "tente",
};

/** A single row on "Şikayetlerim". */
export function ComplaintRow({
  complaint,
  onPress,
}: {
  complaint: ComplaintListItem;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  const categoryLabel = t(`complaint.categories.${complaint.category}`);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={categoryLabel}
      style={({ pressed }) => [
        styles.satir,
        {
          backgroundColor: palet.yuzeyKaldirim,
          borderTopColor: palet.kartUstIsik,
          borderBottomColor: palet.kartAltTemas,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.ustSatir}>
        <Text style={[yazi.title, styles.kategori, { color: palet.yaziAna }]} numberOfLines={1}>
          {categoryLabel}
        </Text>
        <PanelPill label={t(`complaints.status.${complaint.status}`)} ton={DURUM_TONU[complaint.status]} />
      </View>
      <Text style={[yazi.body, { color: palet.yaziSis }]} numberOfLines={2}>
        {complaint.description}
      </Text>
      <Text style={[yazi.data, { color: palet.yaziSis }]}>
        {complaint.status === "RESOLVED" && complaint.resolvedAt
          ? t("complaints.resolvedAt", { date: formatShortDate(complaint.resolvedAt) })
          : t("complaints.slaDeadline", { date: formatShortDate(complaint.slaDeadlineAt) })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  satir: {
    padding: s.s4,
    borderRadius: r.card,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    gap: s.s1,
  },
  ustSatir: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: s.s2,
  },
  kategori: { flex: 1 },
});
