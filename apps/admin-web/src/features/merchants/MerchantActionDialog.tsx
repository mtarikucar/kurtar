import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { LoadingState, ErrorState } from "../../components/QueryStates";
import { fallbackErrorMessage } from "../../lib/apiError";
import { formatDate } from "../../lib/date";
import { useMerchantDetail } from "./useMerchants";
import styles from "./MerchantActionDialog.module.css";

export type MerchantActionVariant = "approve" | "reject" | "suspend";

export interface MerchantActionDialogProps {
  variant: MerchantActionVariant;
  tradeName: string;
  /** [I7 fix] Required for approve/reject — loads the audited KYC detail
   * (docsJson, IBAN, verification history) into THIS dialog so an admin
   * cannot approve/reject without it being shown. Unused for suspend
   * (that decision doesn't turn on KYC content). */
  merchantId?: string;
  pending: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

/**
 * One dialog, three variants. Reject requires a written reason (brief:
 * "reject (with reason)"); suspend states the real, unconditional
 * consequence in words — cancelling every active offer and refunding
 * every affected buyer — because there is NO admin endpoint that returns a
 * pre-click count of a merchant's active offers (confirmed by reading
 * backend/src/modules/offers/offers.controller.ts and merchants.service.ts
 * — offers.listMine is merchant-scoped only, no admin equivalent exists).
 * The real count only exists AFTER the action, in
 * `MerchantSuspendResponseDto.offersCancelled` — shown by the caller once
 * this dialog's onConfirm resolves (see MerchantsPage.tsx).
 */
export function MerchantActionDialog({
  variant,
  tradeName,
  merchantId,
  pending,
  onConfirm,
  onCancel,
}: MerchantActionDialogProps) {
  const { t } = useTranslation("merchants");
  const [note, setNote] = useState("");
  const [showNoteError, setShowNoteError] = useState(false);

  const noteRequired = variant === "reject";
  // [I7 fix] Only fetched for approve/reject — suspend's blast-radius
  // isn't a KYC judgment, and every read of this endpoint is audited
  // server-side, so it's not worth an audit-log entry nobody asked for.
  const needsKycDetail = variant === "approve" || variant === "reject";
  const detail = useMerchantDetail(needsKycDetail ? (merchantId ?? null) : null);

  function handleConfirm() {
    if (noteRequired && note.trim().length === 0) {
      setShowNoteError(true);
      return;
    }
    onConfirm(note.trim());
  }

  const consequence =
    variant === "approve" ? (
      t("approveDialog.consequence", { tradeName })
    ) : variant === "reject" ? (
      t("rejectDialog.consequence", { tradeName })
    ) : (
      <Trans
        i18nKey="suspendDialog.consequence"
        ns="merchants"
        values={{ tradeName }}
        components={{ bold: <strong /> }}
      />
    );

  const dialogText =
    variant === "approve"
      ? {
          title: t("approveDialog.title"),
          noteLabel: t("approveDialog.noteLabel"),
          confirm: t("approveDialog.confirm"),
        }
      : variant === "reject"
        ? {
            title: t("rejectDialog.title"),
            noteLabel: t("rejectDialog.noteLabel"),
            confirm: t("rejectDialog.confirm"),
          }
        : {
            title: t("suspendDialog.title"),
            noteLabel: t("suspendDialog.noteLabel"),
            confirm: t("suspendDialog.confirm"),
          };

  return (
    <ConfirmDialog
      open
      title={dialogText.title}
      danger={variant === "suspend"}
      pending={pending}
      confirmLabel={dialogText.confirm}
      onConfirm={handleConfirm}
      onCancel={onCancel}
      consequence={
        <div>
          <p>{consequence}</p>
          {needsKycDetail ? (
            <div className={styles.kycDetail}>
              {detail.isLoading ? <LoadingState /> : null}
              {detail.isError ? (
                <ErrorState
                  message={fallbackErrorMessage(detail.error, t)}
                  onRetry={() => detail.refetch()}
                />
              ) : null}
              {detail.data ? (
                <dl className={styles.kycFields}>
                  <dt>{t("kyc.iban")}</dt>
                  <dd>{detail.data.iban}</dd>
                  <dt>{t("kyc.taxId")}</dt>
                  <dd>{detail.data.taxId}</dd>
                  <dt>{t("kyc.docs")}</dt>
                  <dd>
                    {detail.data.docsJson ? (
                      <pre className={styles.docsJson}>
                        {JSON.stringify(detail.data.docsJson, null, 2)}
                      </pre>
                    ) : (
                      t("kyc.noDocs")
                    )}
                  </dd>
                  <dt>{t("kyc.history")}</dt>
                  <dd>
                    {detail.data.verificationEvents.length === 0 ? (
                      t("kyc.noHistory")
                    ) : (
                      <ul className={styles.historyList}>
                        {detail.data.verificationEvents.map((event) => (
                          <li key={event.id}>
                            {t("kyc.historyEntry", {
                              from: t(`filter.${event.fromStatus}`),
                              to: t(`filter.${event.toStatus}`),
                              date: formatDate(event.createdAt),
                            })}
                            {event.note ? ` — ${event.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </dl>
              ) : null}
            </div>
          ) : null}
          <label className={styles.noteLabel} htmlFor="merchant-action-note">
            {dialogText.noteLabel}
          </label>
          <textarea
            id="merchant-action-note"
            className={styles.noteInput}
            value={note}
            maxLength={2000}
            rows={3}
            onChange={(e) => {
              setNote(e.target.value);
              if (showNoteError) setShowNoteError(false);
            }}
          />
          {showNoteError ? (
            <p className={styles.noteError}>{t("rejectDialog.noteRequired")}</p>
          ) : null}
        </div>
      }
    />
  );
}
