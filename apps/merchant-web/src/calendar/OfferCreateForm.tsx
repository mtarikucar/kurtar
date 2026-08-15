import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { BagTemplate } from "../api/response-types";
import { getErrorMessage } from "../shared/errors";
import { formatDate, istanbulLocalToIsoInstant } from "../shared/format";
import { Banner } from "../shared/ui/Banner";
import { Button } from "../shared/ui/Button";
import { SelectField } from "../shared/ui/SelectField";
import { Stepper } from "../shared/ui/Stepper";
import { useCreateAndPublishOffer, useCreateAndScheduleOffer } from "./hooks";
import styles from "./CalendarPage.module.css";

export interface OfferCreateFormProps {
  dateKey: string;
  templates: BagTemplate[];
  onSaved: () => void;
  onCancel: () => void;
}

/** Create (and immediately publish, or schedule for later) an offer on a
 * specific date — used by the Takvim week view to fill a gap day. */
export function OfferCreateForm({
  dateKey,
  templates,
  onSaved,
  onCancel,
}: OfferCreateFormProps) {
  const { t } = useTranslation(["calendar", "common"]);
  const activeTemplates = templates.filter((tpl) => tpl.active);

  const [templateId, setTemplateId] = useState(activeTemplates[0]?.id ?? "");
  const [qty, setQty] = useState(5);
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [publishAtDate, setPublishAtDate] = useState(dateKey);
  const [publishAtTime, setPublishAtTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);

  const createAndPublish = useCreateAndPublishOffer();
  const createAndSchedule = useCreateAndScheduleOffer();
  const submitting = createAndPublish.isPending || createAndSchedule.isPending;

  if (activeTemplates.length === 0) {
    return (
      <Banner tone="warning">
        {t("today:noTemplate.body", { ns: "today" })}
      </Banner>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!templateId) return;

    const input = {
      bagTemplateId: templateId,
      offerDate: dateKey,
      qtyTotal: qty,
      pickupStartAt: istanbulLocalToIsoInstant(dateKey, startTime),
      pickupEndAt: istanbulLocalToIsoInstant(dateKey, endTime),
    };

    try {
      if (mode === "now") {
        await createAndPublish.mutateAsync(input);
      } else {
        await createAndSchedule.mutateAsync({
          ...input,
          publishAt: istanbulLocalToIsoInstant(publishAtDate, publishAtTime),
        });
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, t));
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
      <h2>
        {t("calendar:createSheet.heading", { date: formatDate(dateKey) })}
      </h2>
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <SelectField
        label={t("calendar:createSheet.template")}
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
      >
        {activeTemplates.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.title}
          </option>
        ))}
      </SelectField>

      <Stepper
        label={t("calendar:createSheet.qty")}
        value={qty}
        onChange={setQty}
      />

      <div className={styles.row}>
        <label className={styles.timeInput}>
          <span>{t("calendar:createSheet.start")}</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
        <label className={styles.timeInput}>
          <span>{t("calendar:createSheet.end")}</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>
      </div>

      <div className={styles.radioRow} role="radiogroup">
        <label className={styles.radioOption}>
          <input
            type="radio"
            checked={mode === "now"}
            onChange={() => setMode("now")}
          />
          {t("calendar:createSheet.publishNow")}
        </label>
        <label className={styles.radioOption}>
          <input
            type="radio"
            checked={mode === "schedule"}
            onChange={() => setMode("schedule")}
          />
          {t("calendar:createSheet.scheduleFor")}
        </label>
      </div>

      {mode === "schedule" ? (
        <div className={styles.row}>
          <label className={styles.timeInput}>
            <span>{t("calendar:createSheet.publishAt")}</span>
            <input
              type="date"
              value={publishAtDate}
              onChange={(e) => setPublishAtDate(e.target.value)}
            />
          </label>
          <label className={styles.timeInput}>
            <span>&nbsp;</span>
            <input
              type="time"
              value={publishAtTime}
              onChange={(e) => setPublishAtTime(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      <div className={styles.formActions}>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" loading={submitting}>
          {submitting
            ? t("calendar:createSheet.submitting")
            : t("calendar:createSheet.submit")}
        </Button>
      </div>
    </form>
  );
}
