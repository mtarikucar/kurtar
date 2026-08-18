import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { IconButton } from "../../components/IconButton";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { TextField } from "../../components/TextField";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { useAddComplaintMessage, useComplaint } from "../../hooks/use-complaints";
import { getErrorMessage } from "../../lib/errors";
import { formatShortDate } from "../../lib/format";

const STATUS_TONE: Record<string, "brand" | "success" | "warning" | "neutral"> = {
  OPEN: "warning",
  MERCHANT_RESPONDED: "brand",
  RESOLVED: "success",
  ESCALATED: "warning",
};

/** [I8 fix] Thread view for one of the consumer's own complaints — the
 * screen that GET /complaints/{id} existed for but nothing ever rendered. */
export default function ComplaintDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="chevron-back"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>{t("complaints.title")}</Text>
        <View style={{ width: 44 }} />
      </View>

      {complaintQuery.isLoading ? (
        <LoadingState />
      ) : !data ? (
        <EmptyState icon="alert-circle-outline" title={t("errors.notFound")} />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.summaryRow}>
              <Text style={styles.category}>{t(`complaint.categories.${data.category}`)}</Text>
              <Badge label={t(`complaints.status.${data.status}`)} tone={STATUS_TONE[data.status] ?? "neutral"} />
            </View>
            <Text style={styles.description}>{data.description}</Text>
            <Text style={styles.meta}>
              {data.status === "RESOLVED" && data.resolvedAt
                ? t("complaints.resolvedAt", { date: formatShortDate(data.resolvedAt) })
                : t("complaints.slaDeadline", { date: formatShortDate(data.slaDeadlineAt) })}
            </Text>

            <View style={styles.thread}>
              {data.messages.length === 0 ? (
                <Text style={styles.threadEmpty}>{t("complaints.threadEmpty")}</Text>
              ) : (
                data.messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.message,
                      message.authorType === "CONSUMER" ? styles.messageMine : styles.messageOther,
                    ]}
                  >
                    <Text style={styles.messageAuthor}>
                      {t(`complaints.authorLabels.${message.authorType}`)}
                    </Text>
                    <Text style={styles.messageBody}>{message.body}</Text>
                    <Text style={styles.messageDate}>{formatShortDate(message.createdAt)}</Text>
                  </View>
                ))
              )}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.replyRow}>
            <View style={styles.replyInput}>
              <TextField
                label={t("complaints.replyPlaceholder")}
                placeholder={t("complaints.replyPlaceholder")}
                value={reply}
                onChangeText={setReply}
                multiline
              />
            </View>
            <Button
              label={t("complaints.replySend")}
              onPress={handleSend}
              disabled={reply.trim().length === 0}
              loading={addMessage.isPending}
            />
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.neutral[900],
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  category: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.neutral[900],
  },
  description: {
    fontSize: typeScale.body.size,
    color: colors.neutral[700],
  },
  meta: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[500],
  },
  thread: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  threadEmpty: {
    fontSize: typeScale.body.size,
    color: colors.neutral[500],
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  message: {
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
    maxWidth: "88%",
  },
  messageMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary[50],
  },
  messageOther: {
    alignSelf: "flex-start",
    backgroundColor: colors.neutral[100],
  },
  messageAuthor: {
    fontSize: typeScale.label.size,
    fontWeight: typeScale.label.weight,
    color: colors.neutral[600],
  },
  messageBody: {
    fontSize: typeScale.body.size,
    color: colors.neutral[900],
  },
  messageDate: {
    fontSize: typeScale.label.size,
    color: colors.neutral[500],
  },
  error: {
    fontSize: typeScale.caption.size,
    color: colors.semantic.danger[500],
    textAlign: "center",
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: 20,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  replyInput: {
    flex: 1,
  },
});
