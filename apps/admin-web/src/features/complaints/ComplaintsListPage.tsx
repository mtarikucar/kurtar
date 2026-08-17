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
import { COMPLAINT_SLA_THRESHOLDS } from "../../lib/countdown";
import { formatDate } from "../../lib/date";
import { fallbackErrorMessage } from "../../lib/apiError";
import { useComplaintsList, type ComplaintStatusFilter } from "./useComplaints";
import type { ComplaintCategory } from "../../api/admin-types";
import styles from "./ComplaintsListPage.module.css";

const PAGE_SIZE = 20;
const STATUS_FILTERS: ComplaintStatusFilter[] = [
  "ALL",
  "OPEN_ACTIVE",
  "AT_RISK",
  "OPEN",
  "MERCHANT_RESPONDED",
  "ESCALATED",
  "RESOLVED",
];
const CATEGORY_FILTERS: (ComplaintCategory | "ALL")[] = [
  "ALL",
  "FOOD_QUALITY",
  "MISSING_ITEMS",
  "WRONG_ITEMS",
  "STORE_CLOSED_NO_SHOW",
  "RUDE_STAFF",
  "PAYMENT_BILLING",
  "SAFETY_HYGIENE",
  "OTHER",
];

/** Brief: "filters by status/category/merchant". Status and category are
 * dropdowns (fixed enums); merchant is a free-text merchantId field — the
 * admin panel has no merchant picker/autocomplete anywhere else to source
 * IDs from (the admin merchant list itself doesn't expose a "jump to this
 * merchant's complaints" action), so a plain ID field is the only input
 * this screen can offer without inventing a cross-screen affordance out of
 * scope for this task. */
export function ComplaintsListPage() {
  const { t } = useTranslation("complaints");
  const [searchParams, setSearchParams] = useSearchParams();
  const status =
    (searchParams.get("status") as ComplaintStatusFilter | null) ?? "ALL";
  const categoryParam = searchParams.get(
    "category",
  ) as ComplaintCategory | null;
  const merchantIdParam = searchParams.get("merchantId") ?? "";
  const [page, setPage] = useState(1);
  const [merchantIdInput, setMerchantIdInput] = useState(merchantIdParam);

  const list = useComplaintsList(
    {
      status,
      category: categoryParam ?? undefined,
      merchantId: merchantIdParam || undefined,
    },
    page,
    PAGE_SIZE,
  );

  function updateParam(
    key: "status" | "category" | "merchantId",
    value: string,
  ) {
    setPage(1);
    if (!value || value === "ALL") searchParams.delete(key);
    else searchParams.set(key, value);
    setSearchParams(searchParams, { replace: true });
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className={styles.filterRow}>
        <label htmlFor="complaint-status-filter" className={styles.filterLabel}>
          {t("filter.status")}
        </label>
        <select
          id="complaint-status-filter"
          value={status}
          onChange={(e) => updateParam("status", e.target.value)}
          className={styles.filterSelect}
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option} value={option}>
              {t(`filter.${option}`)}
            </option>
          ))}
        </select>

        <label
          htmlFor="complaint-category-filter"
          className={styles.filterLabel}
        >
          {t("filter.category")}
        </label>
        <select
          id="complaint-category-filter"
          value={categoryParam ?? "ALL"}
          onChange={(e) => updateParam("category", e.target.value)}
          className={styles.filterSelect}
        >
          {CATEGORY_FILTERS.map((option) => (
            <option key={option} value={option}>
              {option === "ALL" ? t("filter.ALL") : t(`category.${option}`)}
            </option>
          ))}
        </select>

        <label
          htmlFor="complaint-merchant-filter"
          className={styles.filterLabel}
        >
          {t("filter.merchant")}
        </label>
        <input
          id="complaint-merchant-filter"
          type="text"
          className={styles.filterInput}
          placeholder={t("filter.merchantPlaceholder")}
          value={merchantIdInput}
          onChange={(e) => setMerchantIdInput(e.target.value)}
          onBlur={() => updateParam("merchantId", merchantIdInput.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              updateParam("merchantId", merchantIdInput.trim());
          }}
        />
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
                <th>{t("table.category")}</th>
                <th>{t("table.description")}</th>
                <th>{t("table.status")}</th>
                <th>{t("table.deadline")}</th>
                <th>{t("table.createdAt")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((item) => (
                <tr key={item.id} className={styles.row}>
                  <td>
                    <Link
                      to={`/complaints/${item.id}`}
                      className={styles.rowLink}
                    >
                      {t(`category.${item.category}`)}
                    </Link>
                  </td>
                  <td className={styles.descriptionCell}>{item.description}</td>
                  <td>{t(`filter.${item.status}`)}</td>
                  <td>
                    <DeadlineBadge
                      countdownMs={item.slaCountdownMs}
                      thresholds={COMPLAINT_SLA_THRESHOLDS}
                    />
                  </td>
                  <td>{formatDate(item.createdAt)}</td>
                </tr>
              ))}
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
