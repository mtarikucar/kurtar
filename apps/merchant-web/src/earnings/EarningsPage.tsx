import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../shared/errors";
import { formatDate, formatKurus } from "../shared/format";
import { Banner } from "../shared/ui/Banner";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Spinner } from "../shared/ui/Spinner";
import { StatusPill, type StatusTone } from "../shared/ui/StatusPill";
import { MembershipCard } from "./MembershipCard";
import { SettlementDetail } from "./SettlementDetail";
import { useSettlements } from "./hooks";
import styles from "./EarningsPage.module.css";

const SETTLEMENT_STATUS_TONE: Record<string, StatusTone> = {
  PENDING: "neutral",
  CALCULATED: "info",
  APPROVED: "info",
  SENT: "info",
  SETTLED: "success",
  FAILED: "danger",
  HELD: "warning",
};

export function EarningsPage() {
  const { t } = useTranslation(["earnings", "common"]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const settlementsQuery = useSettlements();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t("earnings:title")}</h1>

      <MembershipCard />

      {selectedBatchId ? (
        <Card>
          <SettlementDetail
            batchId={selectedBatchId}
            onBack={() => setSelectedBatchId(null)}
          />
        </Card>
      ) : (
        <Card className={styles.card}>
          <span className={styles.cardHeading}>
            {t("earnings:statements.heading")}
          </span>

          {settlementsQuery.isPending ? <Spinner /> : null}
          {settlementsQuery.isError ? (
            <Banner
              tone="danger"
              action={
                <Button onClick={() => void settlementsQuery.refetch()}>
                  {t("common:actions.retry")}
                </Button>
              }
            >
              {getErrorMessage(settlementsQuery.error, t)}
            </Banner>
          ) : null}

          {settlementsQuery.data ? (
            settlementsQuery.data.items.length === 0 ? (
              <Banner tone="neutral">{t("earnings:statements.empty")}</Banner>
            ) : (
              <div className={styles.list}>
                {settlementsQuery.data.items.map((batch) => (
                  <button
                    key={batch.id}
                    type="button"
                    className={styles.statementRow}
                    onClick={() => setSelectedBatchId(batch.id)}
                  >
                    <div className={styles.statementHead}>
                      <span className={styles.statementPeriod}>
                        {t("earnings:statements.period", {
                          start: formatDate(batch.periodStart),
                          end: formatDate(batch.periodEnd),
                        })}
                      </span>
                      <StatusPill
                        tone={SETTLEMENT_STATUS_TONE[batch.status] ?? "neutral"}
                      >
                        {t(`earnings:statements.statusLabel.${batch.status}`)}
                      </StatusPill>
                    </div>
                    <span className={styles.statementMeta}>
                      {t("earnings:statements.net")}:{" "}
                      {formatKurus(batch.netPayoutCents)}
                      {batch.dueAt
                        ? ` · ${t("earnings:statements.due")}: ${formatDate(batch.dueAt)}`
                        : ""}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : null}
        </Card>
      )}
    </div>
  );
}
