import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Pagination } from "../../components/Pagination";
import { Banner } from "../../components/Banner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/QueryStates";
import { formatCents } from "../../lib/money";
import { formatDate } from "../../lib/date";
import { fallbackErrorMessage, isApiError } from "../../lib/apiError";
import {
  useInvoicesList,
  useReissueInvoice,
  type InvoiceStatusFilter,
} from "./useInvoices";
import styles from "./InvoicesPage.module.css";

const PAGE_SIZE = 20;
const STATUS_FILTERS: InvoiceStatusFilter[] = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "ALL",
];

/**
 * [M16 fix] The commission e-invoice queue — the first surface of any
 * kind over CommissionInvoice.
 *
 * A commission invoice that the e-document provider refuses stays DRAFT,
 * carrying a real tax obligation. The outbox retries it and a daily cron
 * emails ops about anything still DRAFT hours later, but until this screen
 * there was nowhere to LOOK and nothing to DO: an operator could not see
 * what was stuck, and once the retry ladder was exhausted there was no way
 * to try again short of a database edit.
 *
 * Defaults to DRAFT for that reason — this is a work queue, not a ledger.
 */
export function InvoicesPage() {
  const { t } = useTranslation("invoices");
  const [filter, setFilter] = useState<InvoiceStatusFilter>("DRAFT");
  const [page, setPage] = useState(1);
  const [pendingReissueId, setPendingReissueId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const list = useInvoicesList(filter, page, PAGE_SIZE);
  const reissue = useReissueInvoice();

  function describeError(err: unknown): string {
    if (isApiError(err)) {
      if (err.errorCode === "COMMISSION_INVOICE_NOT_REISSUABLE")
        return t("errors.notReissuable");
      if (err.errorCode === "COMMISSION_INVOICE_INVALID_TAX_ID")
        return t("errors.invalidTaxId");
      if (err.errorCode === "COMMISSION_INVOICE_ISSUE_FAILED")
        return t("errors.providerRefused");
      if (err.errorCode === "COMMISSION_INVOICE_NOT_FOUND")
        return t("errors.notFound");
    }
    return fallbackErrorMessage(err, t);
  }

  function handleConfirmReissue() {
    if (!pendingReissueId) return;
    reissue.mutate(pendingReissueId, {
      onSuccess: (result) => {
        setPendingReissueId(null);
        setBanner({
          kind: "success",
          text: t("reissued", { docId: result.nilveraDocId ?? "—" }),
        });
      },
      onError: (err) => {
        setPendingReissueId(null);
        setBanner({ kind: "error", text: describeError(err) });
      },
    });
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {banner ? (
        <Banner kind={banner.kind} onDismiss={() => setBanner(null)}>
          {banner.text}
        </Banner>
      ) : null}

      <div className={styles.filterRow}>
        <label htmlFor="invoice-status-filter" className={styles.filterLabel}>
          {t("filter.label")}
        </label>
        <select
          id="invoice-status-filter"
          value={filter}
          onChange={(e) => {
            setPage(1);
            setFilter(e.target.value as InvoiceStatusFilter);
          }}
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
      {list.data && list.data.items.length === 0 ? (
        <EmptyState
          message={filter === "DRAFT" ? t("emptyDraft") : undefined}
        />
      ) : null}

      {list.data && list.data.items.length > 0 ? (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("table.merchant")}</th>
                <th>{t("table.type")}</th>
                <th>{t("table.status")}</th>
                <th>{t("table.total")}</th>
                <th>{t("table.createdAt")}</th>
                <th>{t("table.batch")}</th>
                <th>{t("table.action")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((invoice) => (
                <tr key={invoice.id} data-testid={`invoice-${invoice.id}`}>
                  <td>{invoice.merchantTradeName}</td>
                  <td>{t(`type.${invoice.type}`)}</td>
                  <td>
                    <span
                      className={styles.statusPill}
                      data-status={invoice.status}
                    >
                      {t(`status.${invoice.status}`)}
                    </span>
                  </td>
                  <td>{formatCents(invoice.totalAmountCents)}</td>
                  <td>{formatDate(invoice.createdAt)}</td>
                  <td>
                    {invoice.batchId ? (
                      <Link
                        to={`/settlements/${invoice.batchId}`}
                        className={styles.rowLink}
                      >
                        {t("table.openBatch")}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {invoice.status === "DRAFT" ? (
                      <button
                        type="button"
                        className={styles.reissueButton}
                        onClick={() => setPendingReissueId(invoice.id)}
                      >
                        {t("actions.reissue")}
                      </button>
                    ) : (
                      <span className={styles.docId}>
                        {invoice.nilveraDocId ?? "—"}
                      </span>
                    )}
                  </td>
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

      <ConfirmDialog
        open={pendingReissueId !== null}
        title={t("reissueDialog.title")}
        confirmLabel={t("actions.reissue")}
        pending={reissue.isPending}
        onConfirm={handleConfirmReissue}
        onCancel={() => setPendingReissueId(null)}
        consequence={t("reissueDialog.consequence")}
      />
    </div>
  );
}
