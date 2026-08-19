import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";
import { PanelScreen } from "../../components/panel/PanelScreen";
import { PanelHeader } from "../../components/panel/PanelHeader";
import { PanelButton } from "../../components/panel/PanelButton";
import { PanelPill } from "../../components/panel/PanelPill";
import { PanelTextArea } from "../../components/panel/PanelTextArea";
import { PanelLoadingState } from "../../components/panel/PanelLoadingState";
import { PanelEmptyState } from "../../components/panel/PanelEmptyState";
import { useAddComplaintMessage, useComplaint } from "../../hooks/use-complaints";
import { getErrorMessage } from "../../lib/errors";
import { formatShortDate } from "../../lib/format";

const DURUM_TONU: Record<string, "notr" | "sodyum" | "tente"> = {
  OPEN: "tente",
  MERCHANT_RESPONDED: "sodyum",
  RESOLVED: "sodyum",
  ESCALATED: "tente",
};

/**
 * The complaint thread — CONSUMER-only server-side (`GET /complaints/{id}`
 * is scoped by ComplaintsController's class-level `@Actors("CONSUMER")`
 * plus an ownership check that 403s a complaint that isn't the caller's
 * own; see complaints.service.ts's `getMine`). Both failure branches land
 * here as "not found" from the client's point of view — this screen never
 * had a way to prove OWNERSHIP failed vs. the id simply not existing, and
 * inventing one would leak which ids exist to a caller who doesn't own
 * them.
 */
export default function ComplaintDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const { id } = useLocalSearchParams<{ id: string }>();
  const complaintQuery = useComplaint(id ?? "");
  const addMessage = useAddComplaintMessage(id ?? "");

  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  const data = complaintQuery.data;

  const handleSend = async () => {
    const body = reply.trim();
    if (!body) return;
    setError(null);
    try {
      await addMessage.mutateAsync(body);
      setReply("");
    } catch (err) {
      setError(getErrorMessage(err, t));
    }
  };

  return (
    // The reply composer is docked to the bottom of this screen, so the
    // screen has to own the bottom inset too — without it the 48pt Send
    // button sits under the Android navigation bar (tapping it presses
    // Back/Home) and inside the iOS home-indicator strip. iOS gains no
    // double gap when the keyboard opens: KeyboardAvoidingView measures
    // from its own frame bottom to the screen bottom, so a safe-area pad
    // is absorbed, not added.
    <PanelScreen padded={false} edges={["top", "left", "right", "bottom"]}>
      <PanelHeader
        title={t("complaints.title")}
        onBack={() => router.back()}
        backLabel={t("common.back")}
      />

      {complaintQuery.isLoading ? (
        <PanelLoadingState />
      ) : !data ? (
        <PanelEmptyState icon="alert-circle-outline" title={t("errors.notFound")} />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.icerik}>
            <View style={styles.ozetSatiri}>
              <Text style={[yazi.title, styles.kategori, { color: palet.yaziAnaZemin }]}>
                {t(`complaint.categories.${data.category}`)}
              </Text>
              <PanelPill
                label={t(`complaints.status.${data.status}`)}
                ton={DURUM_TONU[data.status] ?? "notr"}
                zemin="sokak"
              />
            </View>
            <Text style={[yazi.body, { color: palet.yaziAnaZemin }]}>{data.description}</Text>
            <Text style={[yazi.data, { color: palet.yaziSisZemin }]}>
              {data.status === "RESOLVED" && data.resolvedAt
                ? t("complaints.resolvedAt", { date: formatShortDate(data.resolvedAt) })
                : t("complaints.slaDeadline", { date: formatShortDate(data.slaDeadlineAt) })}
            </Text>

            <View style={styles.dizi}>
              {data.messages.length === 0 ? (
                <Text style={[yazi.body, styles.bosDizi, { color: palet.yaziSisZemin }]}>
                  {t("complaints.threadEmpty")}
                </Text>
              ) : (
                data.messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.mesaj,
                      message.authorType === "CONSUMER"
                        ? [styles.mesajBenim, { backgroundColor: palet.sodyumDolgu }]
                        : [styles.mesajDiger, { backgroundColor: palet.yuzeyKaldirim }],
                    ]}
                  >
                    <Text
                      style={[
                        yazi.label,
                        {
                          color:
                            message.authorType === "CONSUMER"
                              ? palet.sodyumMurekkep
                              : palet.yaziSis,
                        },
                      ]}
                    >
                      {t(`complaints.authorLabels.${message.authorType}`)}
                    </Text>
                    <Text
                      style={[
                        yazi.body,
                        {
                          color:
                            message.authorType === "CONSUMER" ? palet.sodyumMurekkep : palet.yaziAna,
                        },
                      ]}
                    >
                      {message.body}
                    </Text>
                    <Text
                      style={[
                        yazi.data,
                        {
                          color:
                            message.authorType === "CONSUMER"
                              ? palet.sodyumMurekkep
                              : palet.yaziSis,
                        },
                      ]}
                    >
                      {formatShortDate(message.createdAt)}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {error ? (
              <Text style={[yazi.data, styles.hata, { color: palet.tenteMurekkep }]}>{error}</Text>
            ) : null}
          </ScrollView>

          <View style={[styles.yanitSatiri, { borderTopColor: palet.cizgiKil }]}>
            <View style={styles.yanitGirisi}>
              <PanelTextArea
                label={t("complaints.replyPlaceholder")}
                placeholder={t("complaints.replyPlaceholder")}
                value={reply}
                onChangeText={setReply}
                multiline
                style={styles.yanitInput}
              />
            </View>
            <PanelButton
              label={t("complaints.replySend")}
              onPress={handleSend}
              disabled={reply.trim().length === 0}
              loading={addMessage.isPending}
            />
          </View>
        </KeyboardAvoidingView>
      )}
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  icerik: {
    paddingHorizontal: s.s4,
    paddingBottom: s.s4,
    gap: s.s2,
  },
  ozetSatiri: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: s.s2,
  },
  kategori: { flex: 1 },
  dizi: { marginTop: s.s4, gap: s.s2 },
  bosDizi: { textAlign: "center", paddingVertical: s.s6 },
  mesaj: {
    borderRadius: r.card,
    padding: s.s3,
    gap: 2,
    maxWidth: "88%",
  },
  mesajBenim: { alignSelf: "flex-end" },
  mesajDiger: { alignSelf: "flex-start" },
  hata: { textAlign: "center" },
  yanitSatiri: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: s.s2,
    paddingHorizontal: s.s4,
    paddingVertical: s.s2,
    borderTopWidth: 1,
  },
  yanitGirisi: { flex: 1 },
  yanitInput: { minHeight: 44 },
});
