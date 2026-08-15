import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BagTemplate } from "../api/response-types";
import { getErrorMessage } from "../shared/errors";
import { istanbulLocalToIsoInstant } from "../shared/format";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Banner } from "../shared/ui/Banner";
import { Stepper } from "../shared/ui/Stepper";
import { SelectField } from "../shared/ui/SelectField";
import { useQuickPublish } from "./hooks";
import {
  getLastTemplateId,
  getQuickPublishDefault,
  saveQuickPublishDefault,
} from "./quickPublishDefaults";
import styles from "./QuickPublishCard.module.css";

export interface QuickPublishCardProps {
  merchantId: string;
  dateKey: string;
  templates: BagTemplate[];
}

/**
 * THE single most important interaction in the product (per the task
 * brief). Design: the primary button is always tappable exactly once to
 * go live — it never requires opening a form first. A smart default
 * (remembered per-template quantity + pickup window, see
 * quickPublishDefaults.ts) is pre-selected the moment this card renders,
 * so the happy path really is one tap. The "Ayarları düzenle" link is an
 * escape hatch for the (less common) day a merchant wants a different
 * quantity or window — it never gates the primary action behind itself.
 */
export function QuickPublishCard({
  merchantId,
  dateKey,
  templates,
}: QuickPublishCardProps) {
  const { t } = useTranslation(["today", "common"]);
  const activeTemplates = templates.filter((tpl) => tpl.active);
  const rememberedId = getLastTemplateId(merchantId);
  const initialTemplateId =
    (rememberedId &&
      activeTemplates.some((tpl) => tpl.id === rememberedId) &&
      rememberedId) ||
    activeTemplates[0]?.id;

  const [templateId, setTemplateId] = useState<string | undefined>(
    initialTemplateId,
  );
  const [expanded, setExpanded] = useState(false);
  const template = activeTemplates.find((tpl) => tpl.id === templateId);

  const [qty, setQty] = useState(() =>
    template ? getQuickPublishDefault(merchantId, template.id).qtyTotal : 5,
  );
  const [startTime, setStartTime] = useState(() =>
    template
      ? getQuickPublishDefault(merchantId, template.id).startTime
      : "19:00",
  );
  const [endTime, setEndTime] = useState(() =>
    template
      ? getQuickPublishDefault(merchantId, template.id).endTime
      : "21:00",
  );

  // Switching templates (only reachable via the edit panel) resets the
  // quantity/window fields to THAT template's own remembered defaults.
  useEffect(() => {
    if (!template) return;
    const defaults = getQuickPublishDefault(merchantId, template.id);
    setQty(defaults.qtyTotal);
    setStartTime(defaults.startTime);
    setEndTime(defaults.endTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  const quickPublish = useQuickPublish();

  if (!template) return null;

  async function handlePublish() {
    if (!template) return;
    try {
      await quickPublish.mutateAsync({
        bagTemplateId: template.id,
        offerDate: dateKey,
        qtyTotal: qty,
        pickupStartAt: istanbulLocalToIsoInstant(dateKey, startTime),
        pickupEndAt: istanbulLocalToIsoInstant(dateKey, endTime),
      });
    } catch {
      // Already captured reactively in `quickPublish.error` and rendered
      // above — mutateAsync's own rejection must still be caught HERE
      // (not left to propagate through the void-called async handler
      // below), or it surfaces as an unhandled promise rejection instead
      // of the in-page error banner a merchant actually sees.
      return;
    }
    saveQuickPublishDefault(merchantId, template.id, {
      qtyTotal: qty,
      startTime,
      endTime,
    });
    setExpanded(false);
  }

  const planLabel = t("today:quickPublish.planLabel", {
    title: template.title,
    qty,
    unit: t("common:units.piece"),
    start: startTime,
    end: endTime,
  });

  return (
    <Card className={styles.card}>
      <span className={styles.heading}>{t("today:quickPublish.heading")}</span>

      {quickPublish.error ? (
        <Banner tone="danger">{getErrorMessage(quickPublish.error, t)}</Banner>
      ) : null}

      <div className={styles.planRow}>
        <span className={styles.planText}>{planLabel}</span>
        <button
          type="button"
          className={styles.editToggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {t("today:quickPublish.editLabel")}
        </button>
      </div>

      {expanded ? (
        <div className={styles.editPanel}>
          {activeTemplates.length > 1 ? (
            <SelectField
              label={t("today:quickPublish.templateLabel")}
              value={template.id}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {activeTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.title}
                </option>
              ))}
            </SelectField>
          ) : null}

          <div className={styles.qtyRow}>
            <span className={styles.qtyLabel}>
              {t("today:quickPublish.qtyLabel")}
            </span>
            <Stepper
              label={t("today:quickPublish.qtyLabel")}
              value={qty}
              onChange={setQty}
            />
          </div>

          <div className={styles.timeRow}>
            <label>
              <span className={styles.qtyLabel}>
                {t("today:quickPublish.startLabel")}
              </span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label>
              <span className={styles.qtyLabel}>
                {t("today:quickPublish.endLabel")}
              </span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        size="large"
        fullWidth
        loading={quickPublish.isPending}
        onClick={() => void handlePublish()}
      >
        {quickPublish.isPending
          ? t("today:quickPublish.publishing")
          : t("today:quickPublish.publish")}
      </Button>
    </Card>
  );
}
