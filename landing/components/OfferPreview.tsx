import { formatMoneyCents, formatPickupWindow, formatValueBand } from "@/lib/format";
import type { OfferPreview as OfferPreviewData } from "@/lib/offer";

export interface OfferPreviewLabels {
  /** Pre-uppercased in the message files — a CSS `text-transform:
   * uppercase` is not the browser's to guess in Turkish (i -> İ, not I). */
  panelTitle: string;
  pickupLabel: string;
  valueLabel: string;
  priceLabel: string;
  body: string;
}

/**
 * The share-link preview: which shop, which bag, what it costs and when
 * to fetch it — the four things the person who was sent this link needs
 * before they will install anything.
 *
 * The three figures use the site's own receipt ROWS (`kt-receipt__row`
 * and friends: dotted leader, tabular monospace value, a totalled last
 * line), so a shared bag reads in the same numbers-language as every
 * other worked money example on the site. Deliberately NOT inside
 * `components/Receipt.tsx`'s `.kt-receipt` shell: that class's scalloped
 * `mask-image` is declared `mask-repeat: repeat-x` with no base layer, so
 * everything above the bottom 14px is masked out and the card renders
 * blank — visible on `/` today, and a share link is the last page that
 * can afford invisible content. `.kt-card` is the site's plain panel and
 * has no such problem.
 *
 * No photo and no fabricated struck-through price: the value band plus
 * the price is both honest and the better comparator.
 *
 * A plain, hookless function component — see test/react-element-text.ts
 * for why that matters to this workspace's tests.
 */
export function OfferPreview({
  offer,
  locale,
  labels,
}: {
  offer: Extract<OfferPreviewData, { status: "ok" }>;
  locale: "tr" | "en";
  labels: OfferPreviewLabels;
}) {
  const rows = [
    {
      label: labels.pickupLabel,
      value: formatPickupWindow(offer.pickupStartAt, offer.pickupEndAt),
      total: false,
    },
    {
      label: labels.valueLabel,
      value: formatValueBand(
        offer.originalValueCentsMin,
        offer.originalValueCentsMax,
        locale,
      ),
      total: false,
    },
    {
      label: labels.priceLabel,
      value: formatMoneyCents(offer.priceCents, locale),
      total: true,
    },
  ];

  return (
    <div>
      <h1 style={{ fontSize: "28px" }}>{offer.storeName}</h1>
      <p style={{ marginTop: "var(--space-xs)", color: "var(--color-ink-soft)" }}>
        {offer.district}
      </p>

      <div
        className="kt-card"
        style={{
          marginTop: "var(--space-lg)",
          textAlign: "left",
          maxWidth: "360px",
          marginInline: "auto",
        }}
      >
        <p className="kt-receipt__title">{labels.panelTitle}</p>
        <p style={{ marginBottom: "var(--space-md)" }}>{offer.bagTitle}</p>
        {rows.map((row) => (
          <div
            key={row.label}
            className={`kt-receipt__row${row.total ? " kt-receipt__row--total" : ""}`}
          >
            <span className="kt-receipt__label">{row.label}</span>
            <span className="kt-receipt__leader" aria-hidden="true" />
            <span className="kt-receipt__value kt-figure">{row.value}</span>
          </div>
        ))}
      </div>

      <p style={{ marginTop: "var(--space-lg)", color: "var(--color-ink-soft)" }}>
        {labels.body}
      </p>
    </div>
  );
}
