import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Pagination } from "../../components/Pagination";
import { DeadlineBadge } from "../../components/DeadlineBadge";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/QueryStates";
import { SETTLEMENT_DUE_THRESHOLDS } from "../../lib/countdown";
import { formatCents } from "../../lib/money";
import { formatDate } from "../../lib/date";
import { fallbackErrorMessage } from "../../lib/apiError";
import {
  useSettlementsList,
  type SettlementStatusFilter,
} from "./useSettlements";
import styles from "./SettlementsListPage.module.css";

const PAGE_SIZE = 20;
const STATUS_FILTERS: SettlementStatusFilter[] = [
  "ALL",
  "NEEDS_ATTENTION",
  "HELD",
  "FAILED",
  "PENDING",
  "CALCULATED",
  "APPROVED",
  "SENT",
  "SETTLED",
];

export function SettlementsListPage() {
  const { t } = useTranslation("settlements");
  const [searchParams, setSearchParams] = useSearchParams();
  // Default (no `status` in the URL) is NEEDS_ATTENTION, not ALL — brief:
  // "Surface HELD and FAILED batches first — they are money that hasn't
  // moved." Landing on /settlements directly (not via a dashboard deep
  // link) must show that same prioritized view — AdminSettlementsController_
  // list's own default ordering is `createdAt desc`, which does not
  // prioritize HELD/FAILED at all. "Tümü" is still one filter selection
  // away for a full audit view.
  const filter =
    (searchParams.get("status") as SettlementStatusFilter | null) ??
    "NEEDS_ATTENTION";
  const [page, setPage] = useState(1);

  const list = useSettlementsList(filter, page, PAGE_SIZE);

  function setFilter(next: SettlementStatusFilter) {
    setPage(1);
    if (next === "NEEDS_ATTENTION") searchParams.delete("status");
    else searchParams.set("status", next);
    setSearchParams(searchParams, { replace: true });
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className={styles.filterRow}>
        <label
          htmlFor="settlement-status-filter"
          className={styles.filterLabel}
        >
          {t("filter.label")}
        </label>
        <select
          id="settlement-status-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as SettlementStatusFilter)}
          className={styles.filterSelect}
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option} value={option}>
              {t(`filter.${option}`)}
            </option>
          ))}
        </select>
      </div>

      {list.isLoading ? <LoadingState /> : null}
      {list.isError ? (
        <ErrorState
          message={fallbackErrorMessage(list.error, t)}
          onRetry={() => list.refetch()}
        />
      ) : null}
      {list.data && list.data.items.length === 0 ? <EmptyState /> : null}

      {list.data && list.data.items.length > 0 ? (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("table.merchant")}</th>
                <th>{t("table.period")}</th>
                <th>{t("table.status")}</th>
                <th>{t("table.net")}</th>
                <th>{t("table.dueDate")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((batch) => {
                const dueMs = batch.dueAt
                  ? new Date(batch.dueAt).getTime() - Date.now()
                  : null;
                return (
                  <tr key={batch.id}>
                    <td>
                      <Link
                        to={`/settlements/${batch.id}`}
                        className={styles.rowLink}
                      >
                        {batch.merchant.tradeName}
                      </Link>
                    </td>
                    <td>
                      {formatDate(batch.periodStart)} —{" "}
                      {formatDate(batch.periodEnd)}
                    </td>
                    <td>{t(`filter.${batch.status}`)}</td>
                    <td>{formatCents(batch.netPayoutCents)}</td>
                    <td>
                      {dueMs !== null ? (
                        <DeadlineBadge
                          countdownMs={dueMs}
                          thresholds={SETTLEMENT_DUE_THRESHOLDS}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onPageChange={setPage}
          />
        </>
      ) : null}
    </div>
  );
}
