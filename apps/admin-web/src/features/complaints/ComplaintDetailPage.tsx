import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { DeadlineBadge } from "../../components/DeadlineBadge";
import { LoadingState, ErrorState } from "../../components/QueryStates";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Banner } from "../../components/Banner";
import { COMPLAINT_SLA_THRESHOLDS } from "../../lib/countdown";
import { formatDateTime } from "../../lib/date";
import { fallbackErrorMessage, isApiError } from "../../lib/apiError";
import {
  useComplaintDetail,
  useEscalateComplaint,
  usePostComplaintMessage,
  useResolveComplaint,
} from "./useComplaints";
import styles from "./ComplaintDetailPage.module.css";

type PendingAction = "resolve" | "escalate" | null;

export function ComplaintDetailPage() {
  const { t } = useTranslation("complaints");
  const { id } = useParams<{ id: string }>();
  const detail = useComplaintDetail(id);
  const resolveMutation = useResolveComplaint(id ?? "");
  const escalateMutation = useEscalateComplaint(id ?? "");
  const postMessageMutation = usePostComplaintMessage(id ?? "");

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [messageBody, setMessageBody] = useState("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  function describeError(err: unknown): string {
    if (isApiError(err)) {
      if (err.errorCode === "COMPLAINT_TRANSITION_INVALID")
        return t("errors.transitionInvalid");
      if (err.errorCode === "COMPLAINT_NOT_FOUND") return t("errors.notFound");
    }
    return t("errors.generic");
  }

  function handleSendMessage(event: FormEvent) {
    event.preventDefault();
    if (messageBody.trim().length === 0) return;
    postMessageMutation.mutate(messageBody.trim(), {
      onSuccess: () => setMessageBody(""),
      onError: (err) => setErrorBanner(describeError(err)),
    });
  }

  function handleConfirmAction() {
    if (pendingAction === "resolve") {
      resolveMutation.mutate(undefined, {
        onSuccess: () => setPendingAction(null),
        onError: (err) => {
          setPendingAction(null);
          setErrorBanner(describeError(err));
        },
      });
    } else if (pendingAction === "escalate") {
      escalateMutation.mutate(undefined, {
        onSuccess: () => setPendingAction(null),
        onError: (err) => {
          setPendingAction(null);
          setErrorBanner(describeError(err));
        },
      });
    }
  }

  if (detail.isLoading) return <LoadingState />;
  if (detail.isError) {
    return (
      <ErrorState
        message={fallbackErrorMessage(detail.error)}
        onRetry={() => detail.refetch()}
      />
    );
  }
  if (!detail.data) return null;

  const complaint = detail.data;
  const canTransition =
    complaint.status === "OPEN" || complaint.status === "MERCHANT_RESPONDED";

  return (
    <div>
      <Link to="/complaints" className={styles.backLink}>
        {t("detail.back")}
      </Link>
      <PageHeader
        title={t(`category.${complaint.category}`)}
        actions={
          canTransition ? (
            <>
              <button
                type="button"
                className={styles.escalateButton}
                onClick={() => setPendingAction("escalate")}
              >
                {t("detail.escalateTitle")}
              </button>
              <button
                type="button"
                className={styles.resolveButton}
                onClick={() => setPendingAction("resolve")}
              >
                {t("detail.resolveTitle")}
              </button>
            </>
          ) : undefined
        }
      />

      {errorBanner ? (
        <Banner kind="error" onDismiss={() => setErrorBanner(null)}>
          {errorBanner}
        </Banner>
      ) : null}

      <div className={styles.meta}>
        {/* ComplaintDetailResponseDto (unlike the list item) has no
            server-computed slaCountdownMs — GET /admin/complaints/:id
            returns the raw ComplaintTicketDto + messages only (see
            backend/src/modules/complaints/dto/complaint-response.dto.ts).
            Derived here from the same slaDeadlineAt field, just computed
            against this client's clock rather than a server snapshot. */}
        <DeadlineBadge
          countdownMs={new Date(complaint.slaDeadlineAt).getTime() - Date.now()}
          thresholds={COMPLAINT_SLA_THRESHOLDS}
        />
        <span>{t(`filter.${complaint.status}`)}</span>
        <span>
          {t("detail.openedAt", { date: formatDateTime(complaint.createdAt) })}
        </span>
        {complaint.resolvedAt ? (
          <span>
            {t("detail.resolvedAt", {
              date: formatDateTime(complaint.resolvedAt),
            })}
          </span>
        ) : null}
      </div>

      <p className={styles.description}>{complaint.description}</p>

      <section className={styles.threadSection}>
        <h2 className={styles.threadTitle}>{t("detail.threadTitle")}</h2>
        {complaint.messages.length === 0 ? (
          <p>{t("detail.noMessages")}</p>
        ) : null}
        <ul className={styles.thread}>
          {complaint.messages.map((message) => (
            <li key={message.id} className={styles.message}>
              <div className={styles.messageHeader}>
                <span className={styles.messageAuthor}>
                  {t(`detail.author${authorLabel(message.authorType)}`)}
                </span>
                <span className={styles.messageDate}>
                  {formatDateTime(message.createdAt)}
                </span>
              </div>
              <p className={styles.messageBody}>{message.body}</p>
            </li>
          ))}
        </ul>

        <form onSubmit={handleSendMessage} className={styles.messageForm}>
          <label htmlFor="complaint-message" className={styles.messageLabel}>
            {t("detail.messageLabel")}
          </label>
          <textarea
            id="complaint-message"
            className={styles.messageInput}
            rows={3}
            maxLength={4000}
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={postMessageMutation.isPending}
          >
            {t("detail.sendMessage")}
          </button>
        </form>
      </section>

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction === "resolve"
            ? t("detail.resolveTitle")
            : t("detail.escalateTitle")
        }
        consequence={
          pendingAction === "resolve"
            ? t("detail.resolveConsequence")
            : t("detail.escalateConsequence")
        }
        confirmLabel={
          pendingAction === "resolve"
            ? t("detail.resolveTitle")
            : t("detail.escalateTitle")
        }
        pending={resolveMutation.isPending || escalateMutation.isPending}
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

function authorLabel(authorType: string): string {
  if (authorType === "CONSUMER") return "Consumer";
  if (authorType === "MERCHANT") return "Merchant";
  return "Admin";
}
