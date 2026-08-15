import { useTranslation } from "react-i18next";
import styles from "./Banner.module.css";

export interface BannerProps {
  kind: "success" | "error";
  children: React.ReactNode;
  onDismiss?: () => void;
}

/** An inline result banner — used to show the REAL outcome of an action
 * after it completes (brief: "show the result after" a suspend/action),
 * e.g. "12 teklif iptal edildi" with the genuine count from the API
 * response, never a generic "işlem başarılı". */
export function Banner({ kind, children, onDismiss }: BannerProps) {
  const { t } = useTranslation("common");
  return (
    <div
      className={`${styles.banner} ${styles[kind]}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <span className={styles.message}>{children}</span>
      {onDismiss ? (
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={t("actions.close")}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
