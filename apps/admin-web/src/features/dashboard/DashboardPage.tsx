import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { StatCard } from "../../components/StatCard";
import { DeadlineBadge } from "../../components/DeadlineBadge";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/QueryStates";
import {
  COMPLAINT_SLA_THRESHOLDS,
  REPORT_TAKEDOWN_THRESHOLDS,
} from "../../lib/countdown";
import { formatCents } from "../../lib/money";
import { formatDate } from "../../lib/date";
import { fallbackErrorMessage } from "../../lib/apiError";
import {
  useDashboardSummary,
  useUrgentComplaints,
  useUrgentReports,
  useSettlementsNeedingAttention,
} from "./useDashboardData";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const summary = useDashboardSummary();
  const urgentComplaints = useUrgentComplaints();
  const urgentReports = useUrgentReports();
  const settlementsAttention = useSettlementsNeedingAttention();

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {summary.isLoading ? <LoadingState /> : null}
      {summary.isError ? (
        <ErrorState
          message={fallbackErrorMessage(summary.error, t)}
          onRetry={() => summary.refetch()}
        />
      ) : null}

      {summary.data ? (
        <div className={styles.statGrid}>
          <StatCard
            label={t("tiles.pendingMerchantApprovals")}
            value={summary.data.pendingMerchantApprovals}
            to="/merchants?status=PENDING"
            urgent={summary.data.pendingMerchantApprovals > 0}
          />
          <StatCard
            label={t("tiles.openComplaints")}
            value={summary.data.openComplaints}
            to="/complaints?status=OPEN_ACTIVE"
          />
          <StatCard
            label={t("tiles.complaintsAtRisk")}
            value={summary.data.complaintsSlaAtRisk}
            to="/complaints?status=AT_RISK"
            urgent={summary.data.complaintsSlaAtRisk > 0}
          />
          <StatCard
            label={t("tiles.openReports")}
            value={summary.data.openReports}
            to="/moderation?status=OPEN"
            urgent={summary.data.openReports > 0}
          />
          <StatCard
            label={t("tiles.settlementsNeedingAttention")}
            value={summary.data.settlementBatchesNeedingAttention}
            to="/settlements?status=NEEDS_ATTENTION"
            urgent={summary.data.settlementBatchesNeedingAttention > 0}
          />
          <StatCard
            label={t("tiles.todayGmv")}
            value={formatCents(summary.data.today.gmvCents)}
          />
          <StatCard
            label={t("tiles.todayRedeemed")}
            value={summary.data.today.redeemedCount}
          />
        </div>
      ) : null}

      <div className={styles.previewGrid}>
        <section className={styles.previewCard}>
          <h2 className={styles.previewTitle}>
            {t("sections.urgentComplaints")}
          </h2>
          {urgentComplaints.isLoading ? <LoadingState /> : null}
          {urgentComplaints.isError ? (
            <ErrorState
              message={fallbackErrorMessage(urgentComplaints.error, t)}
              onRetry={() => urgentComplaints.refetch()}
            />
          ) : null}
          {urgentComplaints.data && urgentComplaints.data.length === 0 ? (
            <EmptyState message={t("empty.complaints")} />
          ) : null}
          {urgentComplaints.data && urgentComplaints.data.length > 0 ? (
            <ul className={styles.previewList}>
              {urgentComplaints.data.map((item) => (
                <li key={item.id} className={styles.previewRow}>
                  <Link
                    to={`/complaints/${item.id}`}
                    className={styles.previewLink}
                  >
                    {t("row.category", { category: item.category })}
                  </Link>
                  <DeadlineBadge
                    countdownMs={item.slaCountdownMs}
                    thresholds={COMPLAINT_SLA_THRESHOLDS}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.previewCard}>
          <h2 className={styles.previewTitle}>{t("sections.urgentReports")}</h2>
          {urgentReports.isLoading ? <LoadingState /> : null}
          {urgentReports.isError ? (
            <ErrorState
              message={fallbackErrorMessage(urgentReports.error, t)}
              onRetry={() => urgentReports.refetch()}
            />
          ) : null}
          {urgentReports.data && urgentReports.data.length === 0 ? (
            <EmptyState message={t("empty.reports")} />
          ) : null}
          {urgentReports.data && urgentReports.data.length > 0 ? (
            <ul className={styles.previewList}>
              {urgentReports.data.map((item) => (
                <li key={item.id} className={styles.previewRow}>
                  <Link to="/moderation" className={styles.previewLink}>
                    {t("row.target", {
                      targetType: item.targetType,
                      targetId: item.targetId,
                    })}
                  </Link>
                  <DeadlineBadge
                    countdownMs={item.takedownCountdownMs}
                    thresholds={REPORT_TAKEDOWN_THRESHOLDS}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.previewCard}>
          <h2 className={styles.previewTitle}>
            {t("sections.settlementsHeld")}
          </h2>
          {settlementsAttention.isLoading ? <LoadingState /> : null}
          {settlementsAttention.isError ? (
            <ErrorState
              message={fallbackErrorMessage(settlementsAttention.error, t)}
              onRetry={() => settlementsAttention.refetch()}
            />
          ) : null}
          {settlementsAttention.data &&
          settlementsAttention.data.held.length === 0 ? (
            <EmptyState message={t("empty.settlementsHeld")} />
          ) : null}
          {settlementsAttention.data &&
          settlementsAttention.data.held.length > 0 ? (
            <ul className={styles.previewList}>
              {settlementsAttention.data.held.map((batch) => (
                <li key={batch.id} className={styles.previewRow}>
                  <Link
                    to={`/settlements/${batch.id}`}
                    className={styles.previewLink}
                  >
                    {t("row.merchant", { merchant: batch.merchant.tradeName })}
                  </Link>
                  <span className={styles.dueDate}>
                    {t("row.dueDate", { date: formatDate(batch.dueAt) })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <h2 className={styles.previewTitle}>
            {t("sections.settlementsFailed")}
          </h2>
          {settlementsAttention.data &&
          settlementsAttention.data.failed.length === 0 ? (
            <EmptyState message={t("empty.settlementsFailed")} />
          ) : null}
          {settlementsAttention.data &&
          settlementsAttention.data.failed.length > 0 ? (
            <ul className={styles.previewList}>
              {settlementsAttention.data.failed.map((batch) => (
                <li key={batch.id} className={styles.previewRow}>
                  <Link
                    to={`/settlements/${batch.id}`}
                    className={styles.previewLink}
                  >
                    {t("row.merchant", { merchant: batch.merchant.tradeName })}
                  </Link>
                  <span className={styles.dueDate}>
                    {t("row.dueDate", { date: formatDate(batch.dueAt) })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}
