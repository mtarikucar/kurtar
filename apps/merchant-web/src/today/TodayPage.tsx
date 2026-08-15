import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROUTES } from "../routes";
import { formatDate, istanbulDateKey } from "../shared/format";
import { getErrorMessage } from "../shared/errors";
import { Banner } from "../shared/ui/Banner";
import { Button } from "../shared/ui/Button";
import { Spinner } from "../shared/ui/Spinner";
import { useBagTemplates } from "../shared/entityQueries";
import { OfferCard } from "./OfferCard";
import { PickupListSection } from "./PickupListSection";
import { QuickPublishCard } from "./QuickPublishCard";
import { useTodayOffers } from "./hooks";
import styles from "./TodayPage.module.css";

const LIVE_STATUSES = new Set(["PUBLISHED", "SOLD_OUT"]);

/** The screen a merchant opens 20x a day. An unpublished day is impossible
 * to miss (a red banner up top the instant there's no live offer); getting
 * published is never more than the one big button below it. */
export function TodayPage() {
  const { t } = useTranslation(["today", "common"]);
  const { merchant } = useAuth();
  const dateKey = istanbulDateKey();

  const offersQuery = useTodayOffers();
  const templatesQuery = useBagTemplates();

  if (!merchant) return null;

  if (offersQuery.isPending || templatesQuery.isPending) {
    return <Spinner />;
  }

  if (offersQuery.isError) {
    return (
      <Banner
        tone="danger"
        heading={t("common:error.title")}
        action={
          <Button onClick={() => void offersQuery.refetch()}>
            {t("common:actions.retry")}
          </Button>
        }
      >
        {getErrorMessage(offersQuery.error, t)}
      </Banner>
    );
  }

  if (templatesQuery.isError) {
    return (
      <Banner
        tone="danger"
        heading={t("common:error.title")}
        action={
          <Button onClick={() => void templatesQuery.refetch()}>
            {t("common:actions.retry")}
          </Button>
        }
      >
        {getErrorMessage(templatesQuery.error, t)}
      </Banner>
    );
  }

  const offers = offersQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const activeTemplates = templates.filter((tpl) => tpl.active);
  const hasLiveOfferToday = offers.some((o) => LIVE_STATUSES.has(o.status));
  const templatesWithoutOfferToday = activeTemplates.filter(
    (tpl) => !offers.some((o) => o.bagTemplateId === tpl.id),
  );

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.title}>{t("today:title")}</h1>
        <p className={styles.dateLine}>{formatDate(dateKey)}</p>
      </div>

      {activeTemplates.length === 0 ? (
        <Banner
          tone="warning"
          heading={t("today:noTemplate.heading")}
          action={
            <Link to={ROUTES.stores}>
              <Button>{t("today:noTemplate.cta")}</Button>
            </Link>
          }
        >
          {t("today:noTemplate.body")}
        </Banner>
      ) : (
        <>
          {!hasLiveOfferToday ? (
            <Banner tone="danger" heading={t("today:urgent.heading")}>
              {t("today:urgent.body")}
            </Banner>
          ) : null}

          {offers.length > 0 ? (
            <div className={styles.offerList}>
              {offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          ) : (
            <Banner tone="neutral" heading={t("today:empty.heading")}>
              {t("today:empty.body")}
            </Banner>
          )}

          {templatesWithoutOfferToday.length > 0 ? (
            <QuickPublishCard
              merchantId={merchant.id}
              dateKey={dateKey}
              templates={templatesWithoutOfferToday}
            />
          ) : null}

          {offers.length > 0 ? <PickupListSection /> : null}
        </>
      )}
    </div>
  );
}
