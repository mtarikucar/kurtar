import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../shared/errors";
import { formatDate } from "../shared/format";
import { Banner } from "../shared/ui/Banner";
import { Button } from "../shared/ui/Button";
import { Spinner } from "../shared/ui/Spinner";
import { StatusPill, type StatusTone } from "../shared/ui/StatusPill";
import { TextField } from "../shared/ui/TextField";
import { useComplaintDetail, useReplyToComplaint } from "./hooks";
import styles from "./ReputationPage.module.css";

const COMPLAINT_STATUS_TONE: Record<string, StatusTone> = {
  OPEN: "warning",
  MERCHANT_RESPONDED: "info",
  RESOLVED: "success",
  ESCALATED: "danger",
};

export function ComplaintThread({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const { t } = useTranslation(["reputation", "common"]);
  const detailQuery = useComplaintDetail(id);
  const reply = useReplyToComplaint(id);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError(t("reputation:complaints.replyEmpty"));
      return;
    }
    try {
      await reply.mutateAsync(body.trim());
      setBody("");
    } catch (err) {
      setError(getErrorMessage(err, t));
    }
  }

  return (
    <div className={styles.thread}>
      <Button variant="ghost" onClick={onBack}>
        {t("common:actions.back")}
      </Button>

      {detailQuery.isPending ? <Spinner /> : null}
      {detailQuery.isError ? (
        <Banner tone="danger">{getErrorMessage(detailQuery.error, t)}</Banner>
      ) : null}

      {detailQuery.data ? (
        <>
          <div className={styles.complaintHead}>
            <span>
              {t(`reputation:complaints.category.${detailQuery.data.category}`)}
            </span>
            <StatusPill
              tone={COMPLAINT_STATUS_TONE[detailQuery.data.status] ?? "neutral"}
            >
              {t(`reputation:complaints.status.${detailQuery.data.status}`)}
            </StatusPill>
          </div>
          <p>{detailQuery.data.description}</p>
          <span className={styles.meta}>
            {t("reputation:complaints.slaDeadline")}:{" "}
            {formatDate(detailQuery.data.slaDeadlineAt)}
          </span>

          <span>{t("reputation:complaints.thread")}</span>
          <div className={styles.messages}>
            {detailQuery.data.messages.map((message) => (
              <div
                key={message.id}
                className={[
                  styles.message,
                  message.authorType === "MERCHANT" ? styles.messageMine : "",
                ].join(" ")}
              >
                <span className={styles.messageMeta}>
                  {message.authorType} · {formatDate(message.createdAt)}
                </span>
                <p>{message.body}</p>
              </div>
            ))}
          </div>

          <form
            className={styles.replyForm}
            onSubmit={(e) => void handleSubmit(e)}
          >
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <TextField
              label={t("reputation:complaints.replyLabel")}
              multiline
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("reputation:complaints.replyPlaceholder")}
            />
            <Button type="submit" loading={reply.isPending}>
              {reply.isPending
                ? t("reputation:complaints.replySubmitting")
                : t("reputation:complaints.replySubmit")}
            </Button>
          </form>
        </>
      ) : null}
    </div>
  );
}
