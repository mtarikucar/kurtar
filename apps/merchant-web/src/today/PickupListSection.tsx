import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../shared/errors";
import { Card } from "../shared/ui/Card";
import { Banner } from "../shared/ui/Banner";
import { TextField } from "../shared/ui/TextField";
import { Button } from "../shared/ui/Button";
import { useManualRedeem } from "./hooks";
import styles from "./PickupListSection.module.css";

/**
 * The brief asks for a per-reservation pickup list (code, quantity,
 * customer first name, status) the merchant cross-checks while handing
 * bags over. There is no backend endpoint that returns this: every
 * merchant-reachable route was checked (backend/src/modules/reservations/
 * reservations.controller.ts's `GET /reservations/mine` is
 * `@Actors("CONSUMER")`-only; nothing under offers/stores exposes
 * reservation rows either) — confirmed and flagged as a backend gap in
 * this task's report, not something this app can safely fabricate. Per
 * `never hand-roll fetch calls or re-declare response shapes`, this screen
 * does not invent a call against a nonexistent endpoint.
 *
 * What IS real and wired up: the manual "teslim edildi" fallback via
 * `POST /reservations/:id/redeem`, for a customer whose phone can't do the
 * in-app swipe. That endpoint takes the reservation's id, not its
 * human-readable pickup code, so this form is honestly labelled for that.
 */
export function PickupListSection() {
  const { t } = useTranslation(["today", "common"]);
  const [reservationId, setReservationId] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const manualRedeem = useManualRedeem();

  async function handleSubmit(event: FormEvent) {
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
      <Banner tone="neutral">{t("today:pickup.unavailable")}</Banner>

      <div>
        <p>{t("today:pickup.manualBody")}</p>
        <form
          className={styles.manualForm}
          onSubmit={(e) => void handleSubmit(e)}
        >
          {manualRedeem.error ? (
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
            loading={manualRedeem.isPending}
            disabled={!reservationId.trim()}
          >
            {manualRedeem.isPending
              ? t("today:pickup.manualSubmitting")
              : t("today:pickup.manualSubmit")}
          </Button>
        </form>
      </div>
    </Card>
  );
}
