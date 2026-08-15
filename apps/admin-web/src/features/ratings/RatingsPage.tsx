import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/PageHeader";
import { Pagination } from "../../components/Pagination";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/QueryStates";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Banner } from "../../components/Banner";
import { formatDate } from "../../lib/date";
import { fallbackErrorMessage, isApiError } from "../../lib/apiError";
import {
  useApproveRating,
  useRatingsList,
  useRejectRating,
  useRemoveRating,
  type RatingStatusFilter,
} from "./useRatings";
import styles from "./RatingsPage.module.css";

const PAGE_SIZE = 20;
const STATUS_FILTERS: RatingStatusFilter[] = [
  "ALL",
  "PENDING",
  "APPROVED",
  "REJECTED",
];

export function RatingsPage() {
  const { t } = useTranslation("ratings");
  const [filter, setFilter] = useState<RatingStatusFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const list = useRatingsList(filter, page, PAGE_SIZE);
  const approveMutation = useApproveRating();
  const rejectMutation = useRejectRating();
  const removeMutation = useRemoveRating();

  function describeError(err: unknown): string {
    if (isApiError(err) && err.errorCode === "RATING_NOT_FOUND")
      return t("errors.notFound");
    return t("errors.generic");
  }

  function handleRemoveConfirm() {
    if (!removeTargetId) return;
    removeMutation.mutate(removeTargetId, {
      onSuccess: () => setRemoveTargetId(null),
      onError: (err) => {
        setRemoveTargetId(null);
        setErrorBanner(describeError(err));
      },
    });
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {errorBanner ? (
        <Banner kind="error" onDismiss={() => setErrorBanner(null)}>
          {errorBanner}
        </Banner>
      ) : null}

      <div className={styles.filterRow}>
        <label htmlFor="rating-status-filter" className={styles.filterLabel}>
          {t("filter.label")}
        </label>
        <select
          id="rating-status-filter"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as RatingStatusFilter);
            setPage(1);
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
                <th>{t("table.stars")}</th>
                <th>{t("table.comment")}</th>
                <th>{t("table.status")}</th>
                <th>{t("table.createdAt")}</th>
                <th>{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((rating) => (
                <tr key={rating.id}>
                  <td>{"★".repeat(rating.overallStars)}</td>
                  <td className={styles.commentCell}>{rating.comment}</td>
                  <td>{t(`filter.${rating.moderationStatus}`)}</td>
                  <td>{formatDate(rating.createdAt)}</td>
                  <td className={styles.actionsCell}>
                    {rating.moderationStatus === "PENDING" ? (
                      <>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() =>
                            approveMutation.mutate(rating.id, {
                              onError: (err) =>
                                setErrorBanner(describeError(err)),
                            })
                          }
                        >
                          {t("actions.approve")}
                        </button>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() =>
                            rejectMutation.mutate(rating.id, {
                              onError: (err) =>
                                setErrorBanner(describeError(err)),
                            })
                          }
                        >
                          {t("actions.reject")}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className={styles.dangerActionButton}
                      onClick={() => setRemoveTargetId(rating.id)}
                    >
                      {t("actions.remove")}
                    </button>
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
        open={removeTargetId !== null}
        title={t("removeDialog.title")}
        consequence={t("removeDialog.consequence")}
        confirmLabel={t("removeDialog.confirm")}
        danger
        pending={removeMutation.isPending}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoveTargetId(null)}
      />
    </div>
  );
}
