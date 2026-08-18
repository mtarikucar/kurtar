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
  useRefundComplaint,
  useResolveComplaint,
} from "./useComplaints";
import styles from "./ComplaintDetailPage.module.css";

type PendingAction = "resolve" | "escalate" | "refund" | null;

export function ComplaintDetailPage() {
  const { t } = useTranslation("complaints");
  const { id } = useParams<{ id: string }>();
  const detail = useComplaintDetail(id);
  const resolveMutation = useResolveComplaint(id ?? "");
  const escalateMutation = useEscalateComplaint(id ?? "");
  const postMessageMutation = usePostComplaintMessage(id ?? "");
  const refundMutation = useRefundComplaint(id ?? "");

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [messageBody, setMessageBody] = useState("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [resultBanner, setResultBanner] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  function describeError(err: unknown): string {
    if (isApiError(err)) {
      if (err.errorCode === "COMPLAINT_TRANSITION_INVALID")
        return t("errors.transitionInvalid");
      if (err.errorCode === "COMPLAINT_NOT_FOUND") return t("errors.notFound");
      if (err.errorCode === "COMPLAINT_NO_RESERVATION")
        return t("errors.noReservation");
      if (err.errorCode === "COMPLAINT_ALREADY_REFUNDED")
        return t("errors.alreadyRefunded");
      if (err.errorCode === "RESERVATION_NOT_REFUNDABLE")
        return t("errors.notRefundable");
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
    } else if (pendingAction === "refund") {
      // [I3 fix] The backend never THROWS for a provider-side refund
      // failure — it returns `{ok: false, error}` with a normal 2xx, so
      // "the mutation resolved" and "the money actually moved" are two
      // different questions; both are checked here.
      refundMutation.mutate(undefined, {
        onSuccess: (result) => {
          setPendingAction(null);
          if (result.ok) {
            setResultBanner({ kind: "success", message: t("detail.refundOk") });
          } else {
            setResultBanner({
              kind: "error",
              message: t("detail.refundFailed", { error: result.error }),
            });
          }
        },
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
        message={fallbackErrorMessage(detail.error, t)}
        onRetry={() => detail.refetch()}
      />
    );
  }
  if (!detail.data) return null;

  const complaint = detail.data;
  const canTransition =
    complaint.status === "OPEN" || complaint.status === "MERCHANT_RESPONDED";
  // [I3 fix] Independent of the resolve/escalate transition — a refund is
  // a money action on the LINKED RESERVATION, not a ticket-status change
  // (an admin may still refund a complaint that's already RESOLVED). Only
  // gated on "has a reservation to refund" and "hasn't already triggered
  // one" (refundedAt is this ticket's own single-fire guard — see
  // ComplaintsService.adminRefund).
  const canRefund = Boolean(complaint.reservationId) && !complaint.refundedAt;

  return (
    <div>
      <Link to="/complaints" className={styles.backLink}>
        {t("detail.back")}
      </Link>
      <PageHeader
        title={t(`category.${complaint.category}`)}
        actions={
          canTransition || canRefund ? (
            <>
              {canRefund ? (
                <button
                  type="button"
                  className={styles.refundButton}
                  onClick={() => setPendingAction("refund")}
                >
                  {t("detail.refundTitle")}
                </button>
              ) : null}
              {canTransition ? (
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
              ) : null}
            </>
          ) : undefined
        }
      />

      {resultBanner ? (
        <Banner
          kind={resultBanner.kind}
          onDismiss={() => setResultBanner(null)}
        >
          {resultBanner.message}
        </Banner>
      ) : null}

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
          live
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
            : pendingAction === "escalate"
              ? t("detail.escalateTitle")
              : t("detail.refundTitle")
        }
        consequence={
          pendingAction === "resolve"
            ? t("detail.resolveConsequence")
            : pendingAction === "escalate"
              ? t("detail.escalateConsequence")
              : t("detail.refundConsequence")
        }
        confirmLabel={
          pendingAction === "resolve"
            ? t("detail.resolveTitle")
            : pendingAction === "escalate"
              ? t("detail.escalateTitle")
              : t("detail.refundTitle")
        }
        danger={pendingAction === "refund"}
        pending={
          resolveMutation.isPending ||
          escalateMutation.isPending ||
          refundMutation.isPending
        }
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
