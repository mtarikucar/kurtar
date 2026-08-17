import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Pagination } from "../../components/Pagination";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/QueryStates";
import { Banner } from "../../components/Banner";
import { formatDate } from "../../lib/date";
import { fallbackErrorMessage, isApiError } from "../../lib/apiError";
import {
  useApprovedMerchantsForReverify,
  useApproveMerchant,
  useMerchantsList,
  useRejectMerchant,
  useSuspendMerchant,
  type MerchantStatusFilter,
} from "./useMerchants";
import {
  MerchantActionDialog,
  type MerchantActionVariant,
} from "./MerchantActionDialog";
import type { AdminMerchantListItem } from "../../api/admin-types";
import styles from "./MerchantsPage.module.css";

const PAGE_SIZE = 20;
const FILTER_OPTIONS: MerchantStatusFilter[] = [
  "ALL",
  "PENDING",
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
];

/** A merchant is due for annual re-verification `verifiedAt + 1 year`
 * later — the exact formula backend/src/modules/merchants/merchants.
 * service.ts's `adminApprove()` uses to set `nextReverifyAt` (see
 * `addYears(new Date(), 1)` there). The admin list endpoint doesn't
 * SELECT `nextReverifyAt` itself, but it does select `verifiedAt`, so this
 * reproduces the same date rather than guessing — see useMerchants.ts's
 * `useApprovedMerchantsForReverify` doc comment. */
function computeReverifyDueDate(verifiedAt: string): Date {
  const due = new Date(verifiedAt);
  due.setFullYear(due.getFullYear() + 1);
  return due;
}

const REVERIFY_LOOKAHEAD_DAYS = 60;

export function MerchantsPage() {
  const { t } = useTranslation("merchants");
  const [searchParams, setSearchParams] = useSearchParams();
  const filter =
    (searchParams.get("status") as MerchantStatusFilter | null) ?? "ALL";
  const [page, setPage] = useState(1);
  const [actionTarget, setActionTarget] = useState<{
    variant: MerchantActionVariant;
    merchant: AdminMerchantListItem;
  } | null>(null);
  const [resultBanner, setResultBanner] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const list = useMerchantsList(filter, page, PAGE_SIZE);
  const reverify = useApprovedMerchantsForReverify();

  const approveMutation = useApproveMerchant();
  const rejectMutation = useRejectMerchant();
  const suspendMutation = useSuspendMerchant();
  const pendingMutation =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    suspendMutation.isPending;

  function setFilter(next: MerchantStatusFilter) {
    setPage(1);
    if (next === "ALL") {
      searchParams.delete("status");
    } else {
      searchParams.set("status", next);
    }
    setSearchParams(searchParams, { replace: true });
  }

  function errorMessageFor(err: unknown): string {
    if (isApiError(err)) {
      if (err.errorCode === "MERCHANT_NOT_APPROVABLE")
        return t("errors.notApprovable");
      if (err.errorCode === "MERCHANT_NOT_REJECTABLE")
        return t("errors.notRejectable");
      if (err.errorCode === "MERCHANT_NOT_SUSPENDABLE")
        return t("errors.notSuspendable");
    }
    return t("errors.generic");
  }

  function handleConfirmAction(note: string) {
    if (!actionTarget) return;
    const { variant, merchant } = actionTarget;
    const onSettled = () => setActionTarget(null);
    if (variant === "approve") {
      approveMutation.mutate(
        { id: merchant.id, note: note || undefined },
        {
          onSuccess: onSettled,
          onError: (err) => {
            onSettled();
            setResultBanner({ kind: "error", message: errorMessageFor(err) });
          },
        },
      );
    } else if (variant === "reject") {
      rejectMutation.mutate(
        { id: merchant.id, note },
        {
          onSuccess: onSettled,
          onError: (err) => {
            onSettled();
            setResultBanner({ kind: "error", message: errorMessageFor(err) });
          },
        },
      );
    } else {
      suspendMutation.mutate(
        { id: merchant.id, note: note || undefined },
        {
          onSuccess: (res) => {
            onSettled();
            setResultBanner({
              kind: "success",
              message: t("suspendResult", {
                tradeName: merchant.tradeName,
                count: res.offersCancelled,
              }),
            });
          },
          onError: (err) => {
            onSettled();
            setResultBanner({ kind: "error", message: errorMessageFor(err) });
          },
        },
      );
    }
  }

  const reverifyDue = useMemo(() => {
    if (!reverify.data) return [];
    const now = Date.now();
    const lookaheadMs = REVERIFY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;
    return reverify.data.items
      .filter((m) => m.verifiedAt)
      .map((m) => ({
        merchant: m,
        dueDate: computeReverifyDueDate(m.verifiedAt as string),
      }))
      .filter((row) => row.dueDate.getTime() - now <= lookaheadMs)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [reverify.data]);

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {resultBanner ? (
        <Banner
          kind={resultBanner.kind}
          onDismiss={() => setResultBanner(null)}
        >
          {resultBanner.message}
        </Banner>
      ) : null}

      <div className={styles.filterRow}>
        <label htmlFor="merchant-status-filter" className={styles.filterLabel}>
          {t("filter.label")}
        </label>
        <select
          id="merchant-status-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as MerchantStatusFilter)}
          className={styles.filterSelect}
        >
          {FILTER_OPTIONS.map((option) => (
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
                <th>{t("table.tradeName")}</th>
                <th>{t("table.legalName")}</th>
                <th>{t("table.taxId")}</th>
                <th>{t("table.status")}</th>
                <th>{t("table.verifiedAt")}</th>
                <th>{t("table.createdAt")}</th>
                <th>{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((merchant) => (
                <tr key={merchant.id}>
                  <td>{merchant.tradeName}</td>
                  <td>{merchant.legalName}</td>
                  <td>{merchant.taxId}</td>
                  <td>{t(`filter.${merchant.verificationStatus}`)}</td>
                  <td>{formatDate(merchant.verifiedAt)}</td>
                  <td>{formatDate(merchant.createdAt)}</td>
                  <td className={styles.actionsCell}>
                    {merchant.verificationStatus === "SUBMITTED" ||
                    merchant.verificationStatus === "UNDER_REVIEW" ? (
                      <>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() =>
                            setActionTarget({ variant: "approve", merchant })
                          }
                        >
                          {t("actions.approve")}
                        </button>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() =>
                            setActionTarget({ variant: "reject", merchant })
                          }
                        >
                          {t("actions.reject")}
                        </button>
                      </>
                    ) : null}
                    {merchant.verificationStatus === "APPROVED" ? (
                      <button
                        type="button"
                        className={styles.dangerActionButton}
                        onClick={() =>
                          setActionTarget({ variant: "suspend", merchant })
                        }
                      >
                        {t("actions.suspend")}
                      </button>
                    ) : null}
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

      <section className={styles.reverifySection}>
        <h2 className={styles.reverifyTitle}>{t("reverify.title")}</h2>
        <p className={styles.reverifySubtitle}>{t("reverify.subtitle")}</p>
        {reverify.isLoading ? <LoadingState /> : null}
        {reverify.isError ? (
          <ErrorState
            message={fallbackErrorMessage(reverify.error, t)}
            onRetry={() => reverify.refetch()}
          />
        ) : null}
        {reverify.data && reverifyDue.length === 0 ? (
          <EmptyState message={t("reverify.empty")} />
        ) : null}
        {reverifyDue.length > 0 ? (
          <ul className={styles.reverifyList}>
            {reverifyDue.map(({ merchant, dueDate }) => (
              <li key={merchant.id} className={styles.reverifyRow}>
                <span>{merchant.tradeName}</span>
                <span
                  className={
                    dueDate.getTime() < Date.now()
                      ? styles.reverifyOverdue
                      : undefined
                  }
                >
                  {dueDate.getTime() < Date.now()
                    ? t("reverify.overdue")
                    : t("reverify.dueDate", {
                        date: formatDate(dueDate.toISOString()),
                      })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {actionTarget ? (
        <MerchantActionDialog
          variant={actionTarget.variant}
          tradeName={actionTarget.merchant.tradeName}
          merchantId={actionTarget.merchant.id}
          pending={pendingMutation}
          onConfirm={handleConfirmAction}
          onCancel={() => setActionTarget(null)}
        />
      ) : null}
    </div>
  );
}
