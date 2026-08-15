import { useTranslation } from "react-i18next";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  page: number;
  pageSize: number;
  /** Total matching rows across every page — from the API's `{items,
   * total, page, pageSize}` envelope (brief: "pagination wired to the
   * API's envelope"). */
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: PaginationProps) {
  const { t } = useTranslation("common");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) return null;

  return (
    <nav
      className={styles.pagination}
      aria-label={t("pagination.pageOf", { page, totalPages })}
    >
      <span className={styles.total}>
        {t("pagination.totalItems", { count: total })}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={styles.navButton}
      >
        {t("pagination.previous")}
      </button>
      <span className={styles.pageIndicator}>
        {t("pagination.pageOf", { page, totalPages })}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={styles.navButton}
      >
        {t("pagination.next")}
      </button>
    </nav>
  );
}
