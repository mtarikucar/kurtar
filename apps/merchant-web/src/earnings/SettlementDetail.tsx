import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../shared/errors";
import { formatDate, formatKurus } from "../shared/format";
import { Banner } from "../shared/ui/Banner";
import { Button } from "../shared/ui/Button";
import { Spinner } from "../shared/ui/Spinner";
import { useSettlementDetail } from "./hooks";
import styles from "./EarningsPage.module.css";

export interface SettlementDetailProps {
  batchId: string;
  onBack: () => void;
}

/**
 * The earnings breakdown — the brief's "a merchant must be able to
 * understand WHY their payout is that number" requirement. Every
 * deduction that actually applied to THIS batch gets its own labelled
 * line, in the same gross -> fee -> withholding -> membership -> clawback
 * -> net order the backend computes them in (settlement-math.ts's
 * `computeSettlement` — see that file's own doc comment for the exact
 * arithmetic this mirrors for DISPLAY only; the numbers themselves always
 * come straight from the server, never recomputed client-side). Deductions
 * that didn't apply this period (no membership balance, no clawback) are
 * omitted rather than shown as a confusing "₺0,00" line.
 */
export function SettlementDetail({ batchId, onBack }: SettlementDetailProps) {
  const { t } = useTranslation(["earnings", "common"]);
  const detailQuery = useSettlementDetail(batchId);

  return (
    <div className={styles.breakdown}>
      <Button variant="ghost" className={styles.backButton} onClick={onBack}>
        {t("common:actions.back")}
      </Button>

      {detailQuery.isPending ? <Spinner /> : null}
      {detailQuery.isError ? (
        <Banner tone="danger">{getErrorMessage(detailQuery.error, t)}</Banner>
      ) : null}

      {detailQuery.data ? (
        <>
          <span className={styles.cardHeading}>
            {t("earnings:detail.heading")}
          </span>
          <span className={styles.explainer}>
            {t("earnings:detail.explainer")}
          </span>

          {detailQuery.data.status === "HELD" ? (
            <Banner tone="warning">{t("earnings:detail.held")}</Banner>
          ) : null}

          <div className={styles.breakdownRow}>
            <span className={styles.breakdownLabel}>
              {t("earnings:detail.gross")}
            </span>
            <span>{formatKurus(detailQuery.data.grossCents)}</span>
          </div>
          <div className={styles.breakdownRow}>
            <span className={styles.breakdownLabel}>
              {t("earnings:detail.bagFee")}
            </span>
            <span className={styles.breakdownValueNegative}>
              −{formatKurus(detailQuery.data.bagFeeCents)}
            </span>
          </div>
          <div className={styles.breakdownRow}>
            <span className={styles.breakdownLabel}>
              {t("earnings:detail.bagFeeVat")}
            </span>
            <span className={styles.breakdownValueNegative}>
              −{formatKurus(detailQuery.data.bagFeeVatCents)}
            </span>
          </div>
          <div className={styles.breakdownRow}>
            <span className={styles.breakdownLabel}>
              {t("earnings:detail.withholding")}
            </span>
            <span className={styles.breakdownValueNegative}>
              −{formatKurus(detailQuery.data.withholdingCents)}
            </span>
          </div>
          {detailQuery.data.membershipOffsetCents > 0 ? (
            <div className={styles.breakdownRow}>
              <span className={styles.breakdownLabel}>
                {t("earnings:detail.membershipOffset")}
              </span>
              <span className={styles.breakdownValueNegative}>
                −{formatKurus(detailQuery.data.membershipOffsetCents)}
              </span>
            </div>
          ) : null}
          {detailQuery.data.refundClawbackCents > 0 ? (
            <div className={styles.breakdownRow}>
              <span className={styles.breakdownLabel}>
                {t("earnings:detail.clawback")}
              </span>
              <span className={styles.breakdownValueNegative}>
                −{formatKurus(detailQuery.data.refundClawbackCents)}
              </span>
            </div>
          ) : null}
          {detailQuery.data.carriedShortfallCents > 0 ? (
            <div className={styles.breakdownRow}>
              <span className={styles.breakdownLabel}>
                {t("earnings:detail.carriedShortfall")}
              </span>
              <span>{formatKurus(detailQuery.data.carriedShortfallCents)}</span>
            </div>
          ) : null}

          <div className={styles.breakdownNet}>
            <span>{t("earnings:detail.net")}</span>
            <span>{formatKurus(detailQuery.data.netPayoutCents)}</span>
          </div>

          {detailQuery.data.dueAt ? (
            <div className={styles.kv}>
              <span className={styles.kvLabel}>{t("earnings:detail.due")}</span>
              <span className={styles.kvValue}>
                {formatDate(detailQuery.data.dueAt)}
              </span>
            </div>
          ) : null}

          <span className={styles.explainer}>
            {t("earnings:detail.lineCount", {
              count: detailQuery.data.settlementLines.length,
            })}
          </span>
        </>
      ) : null}
    </div>
  );
}
