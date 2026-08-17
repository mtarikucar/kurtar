import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../shared/errors";
import { formatDate } from "../shared/format";
import { Banner } from "../shared/ui/Banner";
import { Button } from "../shared/ui/Button";
import { Spinner } from "../shared/ui/Spinner";
import { StatusPill, type StatusTone } from "../shared/ui/StatusPill";
import { ComplaintThread } from "./ComplaintThread";
import { useAssignedComplaints } from "./hooks";
import styles from "./ReputationPage.module.css";

const COMPLAINT_STATUS_TONE: Record<string, StatusTone> = {
  OPEN: "warning",
  MERCHANT_RESPONDED: "info",
  RESOLVED: "success",
  ESCALATED: "danger",
};

export function ComplaintsPanel() {
  const { t } = useTranslation(["reputation", "common"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const complaintsQuery = useAssignedComplaints();

  if (selectedId) {
    return (
      <ComplaintThread id={selectedId} onBack={() => setSelectedId(null)} />
    );
  }

  if (complaintsQuery.isPending) return <Spinner />;
  if (complaintsQuery.isError) {
    return (
      <Banner
        tone="danger"
        action={
          <Button onClick={() => void complaintsQuery.refetch()}>
            {t("common:actions.retry")}
          </Button>
        }
      >
        {getErrorMessage(complaintsQuery.error, t)}
      </Banner>
    );
  }

  const items = complaintsQuery.data?.items ?? [];

  if (items.length === 0) {
    return <Banner tone="neutral">{t("reputation:complaints.empty")}</Banner>;
  }

  return (
    <div className={styles.list}>
      {items.map((complaint) => (
        <button
          key={complaint.id}
          type="button"
          className={styles.complaintRow}
          onClick={() => setSelectedId(complaint.id)}
        >
          <div className={styles.complaintHead}>
            <span>
              {t(`reputation:complaints.category.${complaint.category}`)}
            </span>
            <StatusPill
              tone={COMPLAINT_STATUS_TONE[complaint.status] ?? "neutral"}
            >
              {t(`reputation:complaints.status.${complaint.status}`)}
            </StatusPill>
          </div>
          <p className={styles.complaintDesc}>{complaint.description}</p>
          <span className={styles.meta}>
            {t("reputation:complaints.slaDeadline")}:{" "}
            {formatDate(complaint.slaDeadlineAt)}
          </span>
        </button>
      ))}
    </div>
  );
}
