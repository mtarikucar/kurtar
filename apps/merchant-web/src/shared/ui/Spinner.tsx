import { useTranslation } from "react-i18next";
import styles from "./Spinner.module.css";

/** Full-width loading state for a screen/section — paired with Banner for
 * the error/empty states so every data view has all three. */
export function Spinner() {
  const { t } = useTranslation("common");
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {t("status.loading")}
      </span>
    </div>
  );
}
