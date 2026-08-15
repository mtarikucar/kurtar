import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /**
   * The real consequence of the action, stated in words (and, where the
   * API makes a real number available, with that number) — never a bare
   * "emin misiniz?" (brief: "Destructive actions require confirmation
   * that states the consequence in words"). Accepts a ReactNode so a
   * caller can bold the dangerous part.
   */
  consequence: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button for irreversible / money-moving actions. */
  danger?: boolean;
  /** Disables both buttons and shows the confirm button as busy while the
   * mutation this dialog guards is in flight. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A focus-trapped, keyboard-operable confirmation modal. Default focus
 * lands on CANCEL, not the (possibly destructive) confirm action — a
 * stray Enter press should never fire a suspend/cancel/refund by accident.
 * Escape and a backdrop click both cancel.
 */
export function ConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel,
  cancelLabel,
  danger,
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation("common");
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useRef(
    `confirm-dialog-title-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    if (open) cancelButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) return;
      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={containerRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
      >
        <h2 id={titleId.current} className={styles.title}>
          {title}
        </h2>
        <div className={styles.consequence}>{consequence}</div>
        <div className={styles.actions}>
          <button
            type="button"
            ref={cancelButtonRef}
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel ?? t("confirmDialog.cancel")}
          </button>
          <button
            type="button"
            className={danger ? styles.dangerButton : styles.confirmButton}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? t("status.loading") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
