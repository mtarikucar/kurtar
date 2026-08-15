import { useTranslation } from "react-i18next";
import type { OfferMineItem } from "../api/response-types";
import { formatKurus, formatTime } from "../shared/format";
import { getErrorMessage } from "../shared/errors";
import { OFFER_STATUS_TONE } from "../shared/offerStatus";
import { Card } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Banner } from "../shared/ui/Banner";
import { StatusPill } from "../shared/ui/StatusPill";
import { useCancelOffer, useCloseOffer } from "./hooks";
import styles from "./OfferCard.module.css";

const CLOSEABLE = new Set<OfferMineItem["status"]>(["PUBLISHED", "SOLD_OUT"]);
const CANCELLABLE = new Set<OfferMineItem["status"]>([
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "SOLD_OUT",
]);

export function OfferCard({ offer }: { offer: OfferMineItem }) {
  const { t } = useTranslation(["today", "common"]);
  const closeOffer = useCloseOffer();
  const cancelOffer = useCancelOffer();

  function handleClose() {
    if (!window.confirm(t("today:offerCard.closeConfirm"))) return;
    closeOffer.mutate(offer.id);
  }

  function handleCancel() {
    if (!window.confirm(t("today:offerCard.cancelConfirm"))) return;
    cancelOffer.mutate(offer.id);
  }

  const error = closeOffer.error ?? cancelOffer.error;

  return (
    <Card className={styles.card}>
      <div className={styles.headRow}>
        <div>
          <div className={styles.title}>{offer.title}</div>
          <div className={styles.meta}>
            {offer.storeName} · {formatKurus(offer.priceCents)} ·{" "}
            {formatTime(offer.pickupStartAt)}–{formatTime(offer.pickupEndAt)}
          </div>
        </div>
        <StatusPill tone={OFFER_STATUS_TONE[offer.status]}>
          {t(`today:offerCard.status.${offer.status}`)}
        </StatusPill>
      </div>

      {error ? (
        <Banner tone="danger">{getErrorMessage(error, t)}</Banner>
      ) : null}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{offer.qtyTotal}</span>
          <span className={styles.statLabel}>
            {t("today:counters.published")}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{offer.qtyReserved}</span>
          <span className={styles.statLabel}>
            {t("today:counters.reserved")}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{offer.qtyRedeemed}</span>
          <span className={styles.statLabel}>
            {t("today:counters.redeemed")}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{offer.qtyLeft}</span>
          <span className={styles.statLabel}>{t("today:counters.left")}</span>
        </div>
      </div>

      {CLOSEABLE.has(offer.status) || CANCELLABLE.has(offer.status) ? (
        <div className={styles.actions}>
          {CLOSEABLE.has(offer.status) ? (
            <Button
              variant="secondary"
              loading={closeOffer.isPending}
              onClick={handleClose}
            >
              {closeOffer.isPending
                ? t("today:offerCard.closing")
                : t("today:offerCard.close")}
            </Button>
          ) : null}
          {CANCELLABLE.has(offer.status) ? (
            <Button
              variant="danger"
              loading={cancelOffer.isPending}
              onClick={handleCancel}
            >
              {cancelOffer.isPending
                ? t("today:offerCard.cancelling")
                : t("today:offerCard.cancel")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
