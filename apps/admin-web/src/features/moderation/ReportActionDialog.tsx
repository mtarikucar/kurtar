import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { ReportTargetType } from "../../api/admin-types";
import styles from "./ReportActionDialog.module.css";

export type ReportDialogVariant = "action" | "dismiss";

export interface ReportActionDialogProps {
  variant: ReportDialogVariant;
  targetType: ReportTargetType;
  pending: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

const CONSEQUENCE_KEY_BY_TARGET: Record<ReportTargetType, string> = {
  STORE: "actionDialog.consequenceStore",
  OFFER: "actionDialog.consequenceOffer",
  RATING: "actionDialog.consequenceRating",
};

/**
 * "action" (brief: "action/dismiss controls") dispatches to
 * RatingsService.rejectRating / StoresService.adminDeactivate /
 * OffersService.adminCancel depending on `targetType` — see
 * backend/src/modules/moderation/moderation.service.ts's adminAction()
 * doc comment. The OFFER consequence is the money-moving one (cancels the
 * offer, refunds every buyer with a reservation on it) — stated in words
 * because, like merchant suspend, there is no endpoint that returns a
 * pre-click reservation/buyer count for an arbitrary offer id.
 */
export function ReportActionDialog({
  variant,
  targetType,
  pending,
  onConfirm,
  onCancel,
}: ReportActionDialogProps) {
  const { t } = useTranslation("moderation");
  const [note, setNote] = useState("");

  const isDismiss = variant === "dismiss";
  const title = isDismiss
    ? t("actionDialog.dismissTitle")
    : t("actionDialog.actionTitle");
  const consequence = isDismiss
    ? t("actionDialog.dismissConsequence")
    : t(CONSEQUENCE_KEY_BY_TARGET[targetType]);
  const confirmLabel = isDismiss ? t("actions.dismiss") : t("actions.action");

  return (
    <ConfirmDialog
      open
      title={title}
      danger={!isDismiss}
      pending={pending}
      confirmLabel={confirmLabel}
      onConfirm={() => onConfirm(note.trim())}
      onCancel={onCancel}
      consequence={
        <div>
          <p>{consequence}</p>
          <label className={styles.noteLabel} htmlFor="report-action-note">
            {t("actionDialog.noteLabel")}
          </label>
          <textarea
            id="report-action-note"
            className={styles.noteInput}
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      }
    />
  );
}
