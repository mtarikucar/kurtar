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

/**
 * kurtar's business instants are read against Turkey's clock, never the
 * server's or the reader's — this site renders on a container whose TZ is
 * whatever the image sets, and a pickup window printed two hours off is
 * worse than no window at all. Mirrors apps/consumer/src/lib/format.ts,
 * which pins the same zone for the same reason.
 */
const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

/** "18:30" from an ISO instant, İstanbul-local. 24-hour in both locales:
 * a Turkish pickup window is never written "6:30 PM". */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ISTANBUL_TIME_ZONE,
  });
}

/** "18:30–21:00" — the pickup window, en dash, as the app prints it. */
export function formatPickupWindow(startIso: string, endIso: string): string {
  return `${formatClockTime(startIso)}–${formatClockTime(endIso)}`;
}

/** A rounded value band, "₺100–150" — the bag's contents are a range and
 * there is no single struck-through "was" price to print instead. */
export function formatValueBand(
  minCents: number,
  maxCents: number,
  locale: "tr" | "en",
): string {
  const min = Math.round(minCents / 100);
  const max = Math.round(maxCents / 100);
  const int = locale === "en" ? "en-US" : "tr-TR";
  if (min === max) return `~₺${min.toLocaleString(int)}`;
  return `₺${min.toLocaleString(int)}–${max.toLocaleString(int)}`;
}
