import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../shared/errors";
import { formatDate } from "../shared/format";
import { Banner } from "../shared/ui/Banner";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Spinner } from "../shared/ui/Spinner";
import { useRatings } from "./hooks";
import styles from "./ReputationPage.module.css";

const STAR_ORDER = [5, 4, 3, 2, 1] as const;

export function RatingsPanel() {
  const { t } = useTranslation(["reputation", "common"]);
  const ratingsQuery = useRatings();

  if (ratingsQuery.isPending) return <Spinner />;
  if (ratingsQuery.isError) {
    return (
      <Banner
        tone="danger"
        action={
          <Button onClick={() => void ratingsQuery.refetch()}>
            {t("common:actions.retry")}
          </Button>
        }
      >
        {getErrorMessage(ratingsQuery.error, t)}
      </Banner>
    );
  }

  const data = ratingsQuery.data;
  if (!data) return null;

  return (
    <div className={styles.list}>
      <Card className={styles.card}>
        <div className={styles.avgRow}>
          <span className={styles.avgValue}>{data.avgStars.toFixed(1)}</span>
          <span>
            {t("reputation:ratings.count", { count: data.ratingCount })}
          </span>
        </div>
        {data.pendingCount > 0 ? (
          <Banner tone="info">
            {t("reputation:ratings.pending", { count: data.pendingCount })}
          </Banner>
        ) : null}
        <div className={styles.distribution}>
          {STAR_ORDER.map((star) => {
            const count = data.distribution[star];
            const pct =
              data.ratingCount > 0
                ? Math.round((count / data.ratingCount) * 100)
                : 0;
            return (
              <div key={star} className={styles.distRow}>
                <span>{star}★</span>
                <div className={styles.distBarTrack}>
                  <div
                    className={styles.distBarFill}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span>{count}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {data.items.length === 0 ? (
        <Banner tone="neutral">{t("reputation:ratings.empty")}</Banner>
      ) : (
        data.items.map((item) => (
          <Card key={item.id} className={styles.ratingItem}>
            <span>
              {"★".repeat(item.overallStars)}
              {"☆".repeat(5 - item.overallStars)}
            </span>
            <p>{item.comment ?? t("reputation:ratings.noComment")}</p>
            <span className={styles.meta}>{formatDate(item.createdAt)}</span>
          </Card>
        ))
      )}
    </div>
  );
}
