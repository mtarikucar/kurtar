import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/PageHeader";
import { Banner } from "../../components/Banner";
import { client } from "../../api/client";
import { downloadTextFile } from "../../lib/downloadFile";
import { validateExportDateRange } from "../../lib/exportDateRange";
import { fallbackErrorMessage } from "../../lib/apiError";
import styles from "./ExportsPage.module.css";

type ExportKind = "complaints" | "settlements" | "merchants";

const FILENAME_PREFIX: Record<ExportKind, string> = {
  complaints: "sikayetler",
  settlements: "odemeler",
  merchants: "isletmeler",
};

const EXPORT_FN: Record<
  ExportKind,
  (query: { from: string; to: string }) => Promise<string>
> = {
  complaints: (query) => client.admin.exports.complaintsCsv(query),
  settlements: (query) => client.admin.exports.settlementsCsv(query),
  merchants: (query) => client.admin.exports.merchantsCsv(query),
};

export function ExportsPage() {
  const { t } = useTranslation("exports");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState<ExportKind | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Both date fields start empty, which is itself an invalid range — don't
  // greet a just-opened page with a red validation error before the admin
  // has touched anything. Shown once they've interacted with a date field
  // OR tried to download while still invalid.
  const [rangeTouched, setRangeTouched] = useState(false);

  const rangeError = validateExportDateRange(from, to);
  const showRangeError = rangeTouched && rangeError;

  async function handleDownload(kind: ExportKind) {
    if (rangeError) {
      setRangeTouched(true);
      return;
    }
    setErrorMessage(null);
    setDownloading(kind);
    try {
      const csv = await EXPORT_FN[kind]({ from, to });
      downloadTextFile(`${FILENAME_PREFIX[kind]}_${from}_${to}.csv`, csv);
    } catch (err) {
      setErrorMessage(fallbackErrorMessage(err) || t("downloadError"));
    } finally {
      setDownloading(null);
    }
  }

  const cards: ExportKind[] = ["complaints", "settlements", "merchants"];

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {errorMessage ? (
        <Banner kind="error" onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Banner>
      ) : null}

      <div className={styles.rangeRow}>
        <label className={styles.rangeLabel} htmlFor="export-from">
          {t("fromLabel")}
        </label>
        <input
          id="export-from"
          type="date"
          className={styles.dateInput}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setRangeTouched(true);
          }}
        />

        <label className={styles.rangeLabel} htmlFor="export-to">
          {t("toLabel")}
        </label>
        <input
          id="export-to"
          type="date"
          className={styles.dateInput}
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setRangeTouched(true);
          }}
        />
      </div>

      {showRangeError ? (
        <p className={styles.rangeError}>{t(`errors.${rangeError}`)}</p>
      ) : null}

      <div className={styles.cardGrid}>
        {cards.map((kind) => (
          <section key={kind} className={styles.card}>
            <h2 className={styles.cardTitle}>{t(`cards.${kind}.title`)}</h2>
            <p className={styles.cardDescription}>
              {t(`cards.${kind}.description`)}
            </p>
            <button
              type="button"
              className={styles.downloadButton}
              disabled={Boolean(rangeError) || downloading === kind}
              onClick={() => void handleDownload(kind)}
            >
              {downloading === kind ? t("downloading") : t("download")}
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
