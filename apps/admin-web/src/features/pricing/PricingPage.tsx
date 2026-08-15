import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/QueryStates";
import { Banner } from "../../components/Banner";
import { formatCents } from "../../lib/money";
import { formatDate } from "../../lib/date";
import { fallbackErrorMessage, isApiError } from "../../lib/apiError";
import { futurePricing, pickCurrentPricing } from "../../lib/pricing";
import { usePricingList, useSchedulePricing } from "./usePricing";
import styles from "./PricingPage.module.css";

export function PricingPage() {
  const { t } = useTranslation("pricing");
  const list = usePricingList();
  const scheduleMutation = useSchedulePricing();

  const [bagFee, setBagFee] = useState("");
  const [membershipAnnual, setMembershipAnnual] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const current = useMemo(
    () => (list.data ? pickCurrentPricing(list.data) : null),
    [list.data],
  );
  const upcoming = useMemo(
    () => (list.data ? futurePricing(list.data) : []),
    [list.data],
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const bagFeeCents = Math.round(Number(bagFee) * 100);
    const membershipAnnualCents = Math.round(Number(membershipAnnual) * 100);
    if (
      !Number.isFinite(bagFeeCents) ||
      !Number.isFinite(membershipAnnualCents) ||
      !effectiveFrom
    )
      return;

    const effectiveFromIso = new Date(effectiveFrom).toISOString();

    scheduleMutation.mutate(
      { bagFeeCents, membershipAnnualCents, effectiveFrom: effectiveFromIso },
      {
        onSuccess: (result) => {
          setSuccessMessage(
            t("form.success", { date: formatDate(result.effectiveFrom) }),
          );
          setBagFee("");
          setMembershipAnnual("");
          setEffectiveFrom("");
        },
        onError: (err) => {
          if (
            isApiError(err) &&
            err.errorCode === "PRICING_EFFECTIVE_FROM_NOT_FUTURE"
          ) {
            setFormError(t("errors.notFuture"));
          } else {
            setFormError(t("errors.generic"));
          }
        },
      },
    );
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {list.isLoading ? <LoadingState /> : null}
      {list.isError ? (
        <ErrorState
          message={fallbackErrorMessage(list.error)}
          onRetry={() => list.refetch()}
        />
      ) : null}

      {list.data ? (
        <div className={styles.grid}>
          <section className={styles.currentCard}>
            <h2 className={styles.cardTitle}>{t("current.title")}</h2>
            {current ? (
              <>
                <p className={styles.currentValue}>
                  {t("current.bagFee")}:{" "}
                  <strong>{formatCents(current.bagFeeCents)}</strong>
                </p>
                <p className={styles.currentValue}>
                  {t("current.membershipAnnual")}:{" "}
                  <strong>{formatCents(current.membershipAnnualCents)}</strong>
                </p>
                <p className={styles.effectiveDate}>
                  {t("current.effectiveFrom", {
                    date: formatDate(current.effectiveFrom),
                  })}
                </p>
              </>
            ) : (
              <p>{t("current.none")}</p>
            )}

            <h2 className={styles.cardTitle}>{t("upcoming.title")}</h2>
            {upcoming.length === 0 ? (
              <p>{t("upcoming.empty")}</p>
            ) : (
              <ul className={styles.upcomingList}>
                {upcoming.map((row) => (
                  <li key={row.id}>
                    {formatDate(row.effectiveFrom)} —{" "}
                    {formatCents(row.bagFeeCents)} /{" "}
                    {formatCents(row.membershipAnnualCents)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.formCard}>
            <h2 className={styles.cardTitle}>{t("form.title")}</h2>
            <p className={styles.notice}>{t("form.notice")}</p>

            {successMessage ? (
              <Banner kind="success">{successMessage}</Banner>
            ) : null}
            {formError ? (
              <Banner kind="error" onDismiss={() => setFormError(null)}>
                {formError}
              </Banner>
            ) : null}

            <form onSubmit={handleSubmit}>
              <label className={styles.label} htmlFor="pricing-bag-fee">
                {t("form.bagFeeLabel")}
              </label>
              <input
                id="pricing-bag-fee"
                type="number"
                step="0.01"
                min="0"
                required
                className={styles.input}
                value={bagFee}
                onChange={(e) => setBagFee(e.target.value)}
              />

              <label className={styles.label} htmlFor="pricing-membership">
                {t("form.membershipAnnualLabel")}
              </label>
              <input
                id="pricing-membership"
                type="number"
                step="0.01"
                min="0"
                required
                className={styles.input}
                value={membershipAnnual}
                onChange={(e) => setMembershipAnnual(e.target.value)}
              />

              <label className={styles.label} htmlFor="pricing-effective-from">
                {t("form.effectiveFromLabel")}
              </label>
              <input
                id="pricing-effective-from"
                type="date"
                required
                className={styles.input}
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />

              <button
                type="submit"
                className={styles.submitButton}
                disabled={scheduleMutation.isPending}
              >
                {scheduleMutation.isPending
                  ? t("form.submitting")
                  : t("form.submit")}
              </button>
            </form>
          </section>

          <section className={styles.historyCard}>
            <h2 className={styles.cardTitle}>{t("history.title")}</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("history.effectiveFrom")}</th>
                  <th>{t("history.bagFee")}</th>
                  <th>{t("history.membershipAnnual")}</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.effectiveFrom)}</td>
                    <td>{formatCents(row.bagFeeCents)}</td>
                    <td>{formatCents(row.membershipAnnualCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </div>
  );
}
