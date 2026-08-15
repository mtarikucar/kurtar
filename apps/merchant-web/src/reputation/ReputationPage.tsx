import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ComplaintsPanel } from "./ComplaintsPanel";
import { RatingsPanel } from "./RatingsPanel";
import styles from "./ReputationPage.module.css";

type Tab = "ratings" | "complaints";

export function ReputationPage() {
  const { t } = useTranslation(["reputation"]);
  const [tab, setTab] = useState<Tab>("ratings");

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t("reputation:title")}</h1>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ratings"}
          className={[
            styles.tab,
            tab === "ratings" ? styles.tabActive : "",
          ].join(" ")}
          onClick={() => setTab("ratings")}
        >
          {t("reputation:tabs.ratings")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "complaints"}
          className={[
            styles.tab,
            tab === "complaints" ? styles.tabActive : "",
          ].join(" ")}
          onClick={() => setTab("complaints")}
        >
          {t("reputation:tabs.complaints")}
        </button>
      </div>

      {tab === "ratings" ? <RatingsPanel /> : <ComplaintsPanel />}
    </div>
  );
}
