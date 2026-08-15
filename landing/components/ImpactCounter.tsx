import type { ImpactSnapshot } from "@/lib/impact";
import { formatCount, formatKg, formatMoneyCents } from "@/lib/format";
import type { AppLocale } from "@/i18n/routing";

interface ImpactCounterProps {
  data: ImpactSnapshot;
  locale: AppLocale;
  labels: {
    mealsSaved: string;
    co2eAvoided: string;
    moneySaved: string;
    unavailableTitle: string;
    unavailableBody: string;
  };
}

/**
 * Purely presentational — the home page (a Server Component) resolves
 * `getPublicImpact()` and passes the result in, so this component itself
 * needs no data fetching, no "use client", and is trivial to unit test
 * with both branches of `ImpactSnapshot` (see test/impact-counter.test.tsx).
 *
 * The "unavailable" branch renders real content (a plain-language note),
 * never a blank space or a thrown error — task-13 brief: "must degrade to
 * a static fallback if the API is down." It does not fabricate a number.
 */
export function ImpactCounter({ data, locale, labels }: ImpactCounterProps) {
  if (data.status === "unavailable") {
    return (
      <div className="kt-card" role="status">
        <p className="kt-eyebrow kt-eyebrow--green">{labels.unavailableTitle}</p>
        <p style={{ marginTop: "var(--space-md)", color: "var(--color-ink-soft)" }}>
          {labels.unavailableBody}
        </p>
      </div>
    );
  }

  return (
    <div className="kt-stat-grid">
      <div className="kt-stat">
        <span className="kt-stat__value kt-figure">
          {formatCount(data.mealsSaved, locale)}
        </span>
        <span className="kt-stat__label">{labels.mealsSaved}</span>
      </div>
      <div className="kt-stat">
        <span className="kt-stat__value kt-figure">
          {formatKg(data.co2eGrams, locale)} kg
        </span>
        <span className="kt-stat__label">{labels.co2eAvoided}</span>
      </div>
      <div className="kt-stat">
        <span className="kt-stat__value kt-figure">
          {formatMoneyCents(data.moneySavedCents, locale)}
        </span>
        <span className="kt-stat__label">{labels.moneySaved}</span>
      </div>
    </div>
  );
}
