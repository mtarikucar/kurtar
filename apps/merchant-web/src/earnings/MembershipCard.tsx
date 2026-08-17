import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../shared/errors";
import { formatDate, formatKurus } from "../shared/format";
import { Banner } from "../shared/ui/Banner";
import { Card } from "../shared/ui/Card";
import { Spinner } from "../shared/ui/Spinner";
import { useMembership } from "./hooks";
import styles from "./EarningsPage.module.css";

export function MembershipCard() {
  const { t } = useTranslation(["earnings", "common"]);
  const membershipQuery = useMembership();

  if (membershipQuery.isPending) return <Spinner />;
  if (membershipQuery.isError) {
    return (
      <Banner tone="danger">{getErrorMessage(membershipQuery.error, t)}</Banner>
    );
  }

  const membership = membershipQuery.data;
  if (!membership) return null;

  return (
    <Card className={styles.card}>
      <span className={styles.cardHeading}>
        {t("earnings:membership.heading")}
      </span>
      <div className={styles.kv}>
        <span className={styles.kvLabel}>
          {t("earnings:membership.statusRowLabel")}
        </span>
        <span className={styles.kvValue}>
          {t(`earnings:membership.statusLabel.${membership.status}`)}
        </span>
      </div>
      {membership.outstandingCents > 0 ? (
        <div className={styles.kv}>
          <span className={styles.kvLabel}>
            {t("earnings:membership.outstanding")}
          </span>
          <span className={styles.kvValue}>
            {formatKurus(membership.outstandingCents)}
          </span>
        </div>
      ) : (
        <Banner tone="success">{t("earnings:membership.clear")}</Banner>
      )}
      <div className={styles.kv}>
        <span className={styles.kvLabel}>
          {t("earnings:membership.nextAnniversary")}
        </span>
        <span className={styles.kvValue}>
          {formatDate(membership.nextAnniversary)}
        </span>
      </div>
    </Card>
  );
}
