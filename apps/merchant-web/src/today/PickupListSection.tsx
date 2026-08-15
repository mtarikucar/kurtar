import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../shared/errors";
import { Card } from "../shared/ui/Card";
import { Banner } from "../shared/ui/Banner";
import { TextField } from "../shared/ui/TextField";
import { Button } from "../shared/ui/Button";
import { Spinner } from "../shared/ui/Spinner";
import { StatusPill } from "../shared/ui/StatusPill";
import { formatTime } from "../shared/format";
import {
  RESERVATION_STATUS_TONE,
  RESERVATION_STATUS_LABEL,
} from "../shared/reservationStatus";
import { usePickupList, useManualRedeem } from "./hooks";
import styles from "./PickupListSection.module.css";

/**
 * The brief's per-reservation pickup list (code, quantity, customer first
 * name, status) — backed by `GET /reservations/for-merchant`. That
 * endpoint didn't exist when this screen was first built (see git
 * history / task-14's report); this now consumes it directly rather than
 * only offering the manual-by-id fallback below.
 */
export function PickupListSection() {
  const { t } = useTranslation(["today", "common"]);
  const pickupList = usePickupList();
  const manualRedeem = useManualRedeem();
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [reservationId, setReservationId] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleRowRedeem(id: string) {
    setRowError(null);
    setRedeemingId(id);
    try {
      await manualRedeem.mutateAsync(id);
    } catch (err) {
      setRowError(getErrorMessage(err, t));
    } finally {
      setRedeemingId(null);
    }
  }

  async function handleManualSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccessMessage(null);
    const id = reservationId.trim();
    if (!id) return;
    try {
      await manualRedeem.mutateAsync(id);
      setSuccessMessage(t("today:pickup.manualSuccess"));
      setReservationId("");
    } catch {
      // surfaced via manualRedeem.error below
    }
  }

  return (
    <Card className={styles.wrap}>
      <span className={styles.heading}>{t("today:pickup.heading")}</span>

      {pickupList.isPending ? <Spinner /> : null}
      {pickupList.isError ? (
        <Banner
          tone="danger"
          action={
            <Button onClick={() => void pickupList.refetch()}>
              {t("common:actions.retry")}
            </Button>
          }
        >
          {getErrorMessage(pickupList.error, t)}
        </Banner>
      ) : null}
      {pickupList.data && pickupList.data.items.length === 0 ? (
        <Banner tone="neutral">{t("today:pickup.empty")}</Banner>
      ) : null}
      {rowError ? <Banner tone="danger">{rowError}</Banner> : null}

      {pickupList.data && pickupList.data.items.length > 0 ? (
        <ul className={styles.list}>
          {pickupList.data.items.map((item) => (
            <li key={item.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.code}>{item.code}</span>
                <span className={styles.customer}>
                  {item.customerFirstName ?? t("today:pickup.unknownCustomer")}
                </span>
                <span className={styles.qty}>
                  {t("today:pickup.qty", { count: item.qty })}
                </span>
                <span className={styles.pickupTime}>
                  {formatTime(item.pickupStartAt)}–
                  {formatTime(item.pickupEndAt)}
                </span>
                <StatusPill tone={RESERVATION_STATUS_TONE[item.status]}>
                  {RESERVATION_STATUS_LABEL[item.status]}
                </StatusPill>
              </div>
              {item.status === "CONFIRMED" ? (
                <Button
                  loading={redeemingId === item.id && manualRedeem.isPending}
                  onClick={() => void handleRowRedeem(item.id)}
                >
                  {t("today:pickup.redeemCta")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <span className={styles.manualHeading}>
          {t("today:pickup.manualHeading")}
        </span>
        <p>{t("today:pickup.manualBody")}</p>
        <form
          className={styles.manualForm}
          onSubmit={(e) => void handleManualSubmit(e)}
        >
          {manualRedeem.error && !rowError ? (
            <Banner tone="danger">
              {getErrorMessage(manualRedeem.error, t)}
            </Banner>
          ) : null}
          {successMessage ? (
            <Banner tone="success">{successMessage}</Banner>
          ) : null}
          <div className={styles.manualRow}>
            <TextField
              label={t("today:pickup.manualLabel")}
              value={reservationId}
              onChange={(e) => setReservationId(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            loading={manualRedeem.isPending && redeemingId === null}
            disabled={!reservationId.trim()}
          >
            {manualRedeem.isPending && redeemingId === null
              ? t("today:pickup.manualSubmitting")
              : t("today:pickup.manualSubmit")}
          </Button>
        </form>
      </div>
    </Card>
  );
}
