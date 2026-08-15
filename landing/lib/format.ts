/**
 * Money/number formatting shared by every page that renders a price,
 * fee, or business-day figure. `kuruş` (integer cents of TRY) is the
 * backend's money representation everywhere (docs/openapi.json,
 * settlement-math.ts) — landing never receives or displays a float TRY
 * amount, only integers it divides by 100 for display.
 */

const TR_CURRENCY = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const EN_CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats an integer kuruş amount as a locale-appropriate TRY string, e.g. formatMoneyCents(2500, "tr") -> "₺25,00". */
export function formatMoneyCents(cents: number, locale: "tr" | "en"): string {
  const amount = cents / 100;
  return locale === "en" ? EN_CURRENCY.format(amount) : TR_CURRENCY.format(amount);
}

const TR_INT = new Intl.NumberFormat("tr-TR");
const EN_INT = new Intl.NumberFormat("en-US");

/** Formats a plain integer count (meals saved, bags, etc.) with locale thousands separators. */
export function formatCount(value: number, locale: "tr" | "en"): string {
  return locale === "en" ? EN_INT.format(value) : TR_INT.format(value);
}

/** Grams -> kg, one decimal, locale-formatted (impact ledger stores co2eGrams as an integer). */
export function formatKg(grams: number, locale: "tr" | "en"): string {
  const kg = grams / 1000;
  const formatter =
    locale === "en"
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })
      : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
  return formatter.format(kg);
}
