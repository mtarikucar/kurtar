import { useTranslation } from "react-i18next";
import styles from "./QueryStates.module.css";

/**
 * The three states every list/detail screen in this app must render
 * (brief: "Every list: loading / empty / error states"). Kept together in
 * one small file since each is a few lines of near-identical presentation
 * — splitting them further would add indirection without adding clarity.
 */

export function LoadingState() {
  const { t } = useTranslation("common");
  return (
    <div className={styles.state} role="status" aria-live="polite">
      {t("status.loading")}
    </div>
  );
}

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation("common");
  return (
    <div className={styles.errorState} role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          {t("status.retry")}
        </button>
      ) : null}
    </div>
  );
}

export interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  const { t } = useTranslation("common");
  return <div className={styles.state}>{message ?? t("status.empty")}</div>;
}
