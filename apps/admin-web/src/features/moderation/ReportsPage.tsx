import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Pagination } from "../../components/Pagination";
import { DeadlineBadge } from "../../components/DeadlineBadge";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/QueryStates";
import { Banner } from "../../components/Banner";
import { REPORT_TAKEDOWN_THRESHOLDS } from "../../lib/countdown";
import { fallbackErrorMessage, isApiError } from "../../lib/apiError";
import {
  useActionReport,
  useDismissReport,
  useReportsList,
  type ReportStatusFilter,
} from "./useReports";
import {
  ReportActionDialog,
  type ReportDialogVariant,
} from "./ReportActionDialog";
import { TargetPreview } from "./TargetPreview";
import type {
  AdminReportListItem,
  ReportTargetType,
} from "../../api/admin-types";
import styles from "./ReportsPage.module.css";

const PAGE_SIZE = 20;
const STATUS_FILTERS: ReportStatusFilter[] = [
  "ALL",
  "OPEN",
  "ACTIONED",
  "DISMISSED",
];
const TARGET_FILTERS: (ReportTargetType | "ALL")[] = [
  "ALL",
  "STORE",
  "OFFER",
  "RATING",
];

export function ReportsPage() {
  const { t } = useTranslation("moderation");
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter =
    (searchParams.get("status") as ReportStatusFilter | null) ?? "ALL";
  const targetFilter =
    (searchParams.get("targetType") as ReportTargetType | "ALL" | null) ??
    "ALL";
  const [page, setPage] = useState(1);
  const [dialogTarget, setDialogTarget] = useState<{
    variant: ReportDialogVariant;
    report: AdminReportListItem;
  } | null>(null);
  const [resultBanner, setResultBanner] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const list = useReportsList(statusFilter, targetFilter, page, PAGE_SIZE);
  const actionMutation = useActionReport();
  const dismissMutation = useDismissReport();
  const pending = actionMutation.isPending || dismissMutation.isPending;

  function setFilter(key: "status" | "targetType", value: string) {
    setPage(1);
    if (value === "ALL") searchParams.delete(key);
    else searchParams.set(key, value);
    setSearchParams(searchParams, { replace: true });
  }

  function describeError(err: unknown): string {
    if (isApiError(err)) {
      if (err.errorCode === "REPORT_ALREADY_HANDLED")
        return t("errors.alreadyHandled");
      if (err.errorCode === "REPORT_NOT_FOUND") return t("errors.notFound");
    }
    return t("errors.generic");
  }

  function handleConfirm(note: string) {
    if (!dialogTarget) return;
    const { variant, report } = dialogTarget;
    const mutation = variant === "action" ? actionMutation : dismissMutation;
    mutation.mutate(
      { id: report.id, note: note || undefined },
      {
        onSuccess: () => {
          setDialogTarget(null);
          setResultBanner({
            kind: "success",
            message: t(
              `filter.${variant === "action" ? "ACTIONED" : "DISMISSED"}`,
            ),
          });
        },
        onError: (err) => {
          setDialogTarget(null);
          setResultBanner({ kind: "error", message: describeError(err) });
        },
      },
    );
  }

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
        <label htmlFor="report-status-filter" className={styles.filterLabel}>
          {t("filter.status")}
        </label>
        <select
          id="report-status-filter"
          value={statusFilter}
          onChange={(e) => setFilter("status", e.target.value)}
          className={styles.filterSelect}
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option} value={option}>
              {t(`filter.${option}`)}
            </option>
          ))}
        </select>

        <label htmlFor="report-target-filter" className={styles.filterLabel}>
          {t("filter.targetType")}
        </label>
        <select
          id="report-target-filter"
          value={targetFilter}
          onChange={(e) => setFilter("targetType", e.target.value)}
          className={styles.filterSelect}
        >
          {TARGET_FILTERS.map((option) => (
            <option key={option} value={option}>
              {t(`filter.${option}`)}
            </option>
          ))}
        </select>
      </div>

      {list.isLoading ? <LoadingState /> : null}
      {list.isError ? (
        <ErrorState
          message={fallbackErrorMessage(list.error)}
          onRetry={() => list.refetch()}
        />
      ) : null}
      {list.data && list.data.items.length === 0 ? <EmptyState /> : null}

      {list.data && list.data.items.length > 0 ? (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("table.target")}</th>
                <th>{t("table.reason")}</th>
                <th>{t("table.status")}</th>
                <th>{t("table.deadline")}</th>
                <th>{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((report) => (
                <tr key={report.id}>
                  <td>
                    <TargetPreview
                      targetType={report.targetType}
                      targetId={report.targetId}
                    />
                  </td>
                  <td className={styles.reasonCell}>{report.reason}</td>
                  <td>{t(`filter.${report.status}`)}</td>
                  <td>
                    <DeadlineBadge
                      countdownMs={report.takedownCountdownMs}
                      thresholds={REPORT_TAKEDOWN_THRESHOLDS}
                    />
                  </td>
                  <td className={styles.actionsCell}>
                    {report.status === "OPEN" ? (
                      <>
                        <button
                          type="button"
                          className={styles.dangerActionButton}
                          onClick={() =>
                            setDialogTarget({ variant: "action", report })
                          }
                        >
                          {t("actions.action")}
                        </button>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() =>
                            setDialogTarget({ variant: "dismiss", report })
                          }
                        >
                          {t("actions.dismiss")}
                        </button>
                      </>
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

      {dialogTarget ? (
        <ReportActionDialog
          variant={dialogTarget.variant}
          targetType={dialogTarget.report.targetType}
          pending={pending}
          onConfirm={handleConfirm}
          onCancel={() => setDialogTarget(null)}
        />
      ) : null}
    </div>
  );
}
