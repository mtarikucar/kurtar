import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useBagTemplates } from "../shared/entityQueries";
import { getErrorMessage } from "../shared/errors";
import {
  addDaysToKey,
  formatDate,
  formatShortDate,
  formatTime,
  formatWeekday,
  istanbulDateKey,
  weekKeysContaining,
} from "../shared/format";
import { OFFER_STATUS_TONE } from "../shared/offerStatus";
import { Banner } from "../shared/ui/Banner";
import { Button } from "../shared/ui/Button";
import { Spinner } from "../shared/ui/Spinner";
import { StatusPill } from "../shared/ui/StatusPill";
import { OfferCreateForm } from "./OfferCreateForm";
import { useTodayOffersForWeek } from "./hooks";
import styles from "./CalendarPage.module.css";

/**
 * Week view of offers — "so gaps are obvious" per the brief. Per
 * hooks.ts's doc comment, `GET /offers/mine` can only be queried for TODAY
 * through this app's client today, so only today's day cell carries a real
 * dot/offer list here; every other day is still fully USABLE for creating
 * or scheduling a future offer (that's a POST, unaffected by the gap) —
 * it just can't show what, if anything, already exists on it. Day-of
 * operations (close/cancel, the pickup list) for TODAY live on the Bugün
 * screen, which owns that responsibility; this screen's job is the
 * forward-looking overview and scheduling.
 */
export function CalendarPage() {
  const { t } = useTranslation(["calendar", "today", "common"]);
  const todayKey = istanbulDateKey();
  const [weekAnchor, setWeekAnchor] = useState(todayKey);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [creating, setCreating] = useState(false);

  const weekKeys = weekKeysContaining(weekAnchor);
  const todayOffersQuery = useTodayOffersForWeek();
  const templatesQuery = useBagTemplates();

  if (todayOffersQuery.isPending || templatesQuery.isPending)
    return <Spinner />;
  if (todayOffersQuery.isError) {
    return (
      <Banner tone="danger">
        {getErrorMessage(todayOffersQuery.error, t)}
      </Banner>
    );
  }
  if (templatesQuery.isError) {
    return (
      <Banner tone="danger">{getErrorMessage(templatesQuery.error, t)}</Banner>
    );
  }

  const todayOffers = todayOffersQuery.data ?? [];
  const isPastDate = selectedDate < todayKey;
  const isTodaySelected = selectedDate === todayKey;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t("calendar:title")}</h1>

      <Banner tone="info">{t("calendar:listingLimitedNotice")}</Banner>

      {todayOffers.length === 0 ? (
        <Banner tone="warning">{t("calendar:todayGapWarning")}</Banner>
      ) : null}

      <div className={styles.weekNav}>
        <button
          type="button"
          className={styles.weekNavButton}
          onClick={() => setWeekAnchor((k) => addDaysToKey(k, -7))}
          aria-label={t("calendar:weekPrev")}
        >
          ‹
        </button>
        <span>
          {formatShortDate(weekKeys[0])} – {formatShortDate(weekKeys[6])}
        </span>
        <button
          type="button"
          className={styles.weekNavButton}
          onClick={() => setWeekAnchor((k) => addDaysToKey(k, 7))}
          aria-label={t("calendar:weekNext")}
        >
          ›
        </button>
      </div>

      <div className={styles.weekStrip} role="tablist">
        {weekKeys.map((key) => {
          const isToday = key === todayKey;
          const hasOffer = isToday && todayOffers.length > 0;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={key === selectedDate}
              className={[
                styles.dayCell,
                key === selectedDate ? styles.dayCellSelected : "",
              ].join(" ")}
              onClick={() => setSelectedDate(key)}
            >
              <span className={styles.dayCellWeekday}>
                {formatWeekday(key)}
              </span>
              <span className={styles.dayCellNumber}>{key.slice(8, 10)}</span>
              <span
                className={
                  hasOffer ? styles.dayCellDot : styles.dayCellEmptyDot
                }
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      <div className={styles.dayDetail}>
        <span className={styles.dayDetailHeading}>
          {formatDate(selectedDate)}
        </span>

        {creating ? (
          <OfferCreateForm
            dateKey={selectedDate}
            templates={templatesQuery.data ?? []}
            onSaved={() => setCreating(false)}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <>
            {isTodaySelected ? (
              todayOffers.length === 0 ? (
                <Banner tone="neutral">{t("calendar:dayEmpty")}</Banner>
              ) : (
                todayOffers.map((offer) => (
                  <div key={offer.id} className={styles.offerRow}>
                    <span>
                      {offer.title} · {formatTime(offer.pickupStartAt)}–
                      {formatTime(offer.pickupEndAt)}
                    </span>
                    <StatusPill tone={OFFER_STATUS_TONE[offer.status]}>
                      {t(`today:offerCard.status.${offer.status}`)}
                    </StatusPill>
                  </div>
                ))
              )
            ) : (
              <Banner tone="neutral">{t("calendar:otherDayNotice")}</Banner>
            )}
            {!isPastDate ? (
              <Button onClick={() => setCreating(true)}>
                {t("calendar:addOffer")}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
