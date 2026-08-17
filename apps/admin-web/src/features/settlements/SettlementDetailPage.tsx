import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { DeadlineBadge } from "../../components/DeadlineBadge";
import { LoadingState, ErrorState } from "../../components/QueryStates";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Banner } from "../../components/Banner";
import { SETTLEMENT_DUE_THRESHOLDS } from "../../lib/countdown";
import { formatCents } from "../../lib/money";
import { formatDate } from "../../lib/date";
import { fallbackErrorMessage, isApiError } from "../../lib/apiError";
import {
  computeTotalDeductionsCents,
  isBreakdownConsistent,
} from "../../lib/settlementBreakdown";
import {
  useApproveSettlement,
  useHoldSettlement,
  useRetrySettlement,
  useSettlementDetail,
} from "./useSettlements";
import styles from "./SettlementDetailPage.module.css";

type PendingAction = "approve" | "hold" | "retry" | null;

export function SettlementDetailPage() {
  const { t } = useTranslation("settlements");
  const { id } = useParams<{ id: string }>();
  const detail = useSettlementDetail(id);
  const approveMutation = useApproveSettlement(id ?? "");
  const holdMutation = useHoldSettlement(id ?? "");
  const retryMutation = useRetrySettlement(id ?? "");

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [holdNote, setHoldNote] = useState("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  function describeError(err: unknown): string {
    if (isApiError(err)) {
      if (err.errorCode === "SETTLEMENT_NOT_APPROVABLE")
        return t("errors.notApprovable");
      if (err.errorCode === "SETTLEMENT_NOT_HOLDABLE")
        return t("errors.notHoldable");
      if (err.errorCode === "SETTLEMENT_NOT_RETRYABLE")
        return t("errors.notRetryable");
      if (err.errorCode === "SETTLEMENT_BATCH_NOT_FOUND")
        return t("errors.notFound");
    }
    return t("errors.generic");
  }

  function handleConfirm() {
    const onSettled = () => setPendingAction(null);
    if (pendingAction === "approve") {
      approveMutation.mutate(undefined, {
        onSuccess: onSettled,
        onError: (err) => {
          onSettled();
          setErrorBanner(describeError(err));
        },
      });
    } else if (pendingAction === "hold") {
      holdMutation.mutate(holdNote.trim() || undefined, {
        onSuccess: () => {
          setHoldNote("");
          onSettled();
        },
        onError: (err) => {
          onSettled();
          setErrorBanner(describeError(err));
        },
      });
    } else if (pendingAction === "retry") {
      retryMutation.mutate(undefined, {
        onSuccess: onSettled,
        onError: (err) => {
          onSettled();
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

  const batch = detail.data;
  const totalDeductions = computeTotalDeductionsCents(batch);
  const consistent = isBreakdownConsistent(batch);
  const dueMs = batch.dueAt
    ? new Date(batch.dueAt).getTime() - Date.now()
    : null;

  const canApprove = batch.status === "CALCULATED";
  const canHold = batch.status === "CALCULATED" || batch.status === "APPROVED";
  const canRetry = batch.status === "HELD" || batch.status === "APPROVED";

  return (
    <div>
      <Link to="/settlements" className={styles.backLink}>
        {t("detail.back")}
      </Link>
      <PageHeader
        title={batch.merchant.tradeName}
        subtitle={t("detail.period", {
          start: formatDate(batch.periodStart),
          end: formatDate(batch.periodEnd),
        })}
        actions={
          <>
            {canApprove ? (
              <button
                type="button"
                className={styles.approveButton}
                onClick={() => setPendingAction("approve")}
              >
                {t("detail.actions.approve")}
              </button>
            ) : null}
            {canHold ? (
              <button
                type="button"
                className={styles.holdButton}
                onClick={() => setPendingAction("hold")}
              >
                {t("detail.actions.hold")}
              </button>
            ) : null}
            {canRetry ? (
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => setPendingAction("retry")}
              >
                {t("detail.actions.retry")}
              </button>
            ) : null}
          </>
        }
      />

      {errorBanner ? (
        <Banner kind="error" onDismiss={() => setErrorBanner(null)}>
          {errorBanner}
        </Banner>
      ) : null}

      <div className={styles.grid}>
        <section className={styles.breakdownCard}>
          <h2 className={styles.cardTitle}>{t("detail.breakdownTitle")}</h2>
          {!consistent ? (
            <div className={styles.inconsistencyWarning} role="alert">
              {t("detail.inconsistencyWarning")}
            </div>
          ) : null}
          <dl className={styles.breakdownList}>
            <div className={styles.breakdownRow}>
              <dt>{t("detail.gross")}</dt>
              <dd>{formatCents(batch.grossCents)}</dd>
            </div>
            <div className={styles.breakdownRow}>
              <dt>{t("detail.bagFee")}</dt>
              <dd>-{formatCents(batch.bagFeeCents)}</dd>
            </div>
            <div className={styles.breakdownRow}>
              <dt>{t("detail.bagFeeVat")}</dt>
              <dd>-{formatCents(batch.bagFeeVatCents)}</dd>
            </div>
            <div className={styles.breakdownRow}>
              <dt>{t("detail.withholding")}</dt>
              <dd>-{formatCents(batch.withholdingCents)}</dd>
            </div>
            <div className={styles.breakdownRow}>
              <dt>{t("detail.membershipOffset")}</dt>
              <dd>-{formatCents(batch.membershipOffsetCents)}</dd>
            </div>
            <div className={styles.breakdownRow}>
              <dt>{t("detail.membershipOffsetVat")}</dt>
              <dd>-{formatCents(batch.membershipOffsetVatCents)}</dd>
            </div>
            <div className={styles.breakdownRow}>
              <dt>{t("detail.refundClawback")}</dt>
              <dd>-{formatCents(batch.refundClawbackCents)}</dd>
            </div>
            <div className={`${styles.breakdownRow} ${styles.subtotalRow}`}>
              <dt>{t("detail.totalDeductions")}</dt>
              <dd>-{formatCents(totalDeductions)}</dd>
            </div>
            <div className={`${styles.breakdownRow} ${styles.netRow}`}>
              <dt>{t("detail.net")}</dt>
              <dd>{formatCents(batch.netPayoutCents)}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.sideCard}>
          <h2 className={styles.cardTitle}>{t("detail.dueDateTitle")}</h2>
          {dueMs !== null ? (
            <DeadlineBadge
              countdownMs={dueMs}
              thresholds={SETTLEMENT_DUE_THRESHOLDS}
            />
          ) : (
            "—"
          )}
          {batch.holdReason ? (
            <p className={styles.holdReason}>
              <strong>{t("detail.holdReasonLabel")}:</strong> {batch.holdReason}
            </p>
          ) : null}

          <h2 className={styles.cardTitle}>{t("detail.merchantInfoTitle")}</h2>
          <p>{batch.merchant.legalName}</p>
          <p>
            {t("detail.iban")}: {batch.merchant.iban}
          </p>
        </section>
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction ? t(`detail.${pendingAction}Dialog.title`) : ""}
        confirmLabel={pendingAction ? t("detail.actions." + pendingAction) : ""}
        pending={
          approveMutation.isPending ||
          holdMutation.isPending ||
          retryMutation.isPending
        }
        onConfirm={handleConfirm}
        onCancel={() => setPendingAction(null)}
        consequence={
          <div>
            <p>
              {pendingAction
                ? t(`detail.${pendingAction}Dialog.consequence`)
                : ""}
            </p>
            {pendingAction === "hold" ? (
              <>
                <label className={styles.noteLabel} htmlFor="hold-note">
                  {t("detail.holdDialog.noteLabel")}
                </label>
                <textarea
                  id="hold-note"
                  className={styles.noteInput}
                  rows={3}
                  maxLength={2000}
                  value={holdNote}
                  onChange={(e) => setHoldNote(e.target.value)}
                />
              </>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
