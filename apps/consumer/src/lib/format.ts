/** Formatting helpers — Turkish locale throughout (₺ money, tr-TR dates/times). */
import { formatMoneyCents } from "@kurtar/ui-tokens";

/** Cents (kuruş) -> "₺49,90". Every price in the API is an integer cents
 * field. Re-exported from the shared `@kurtar/ui-tokens` formatter — this
 * app's own hand-rolled version used to suffix the symbol ("49,90 ₺"),
 * diverging from merchant-web/admin-web/landing's shared "₺49,90" prefix
 * convention (Task 14's consistency sweep found the mismatch). */
export const formatPriceCents = formatMoneyCents;

/** A rounded value-band, e.g. "150–200 ₺" — original value min/max are always whole-lira-ish cents. */
export function formatValueBand(minCents: number, maxCents: number): string {
  const min = Math.round(minCents / 100);
  const max = Math.round(maxCents / 100);
  if (min === max) return `~${min} ₺`;
  return `${min}–${max} ₺`;
}

/** Meters -> "350 m" under 1km, "2,4 km" at/above. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} km`;
}

/** "18:30" from an ISO instant, Istanbul-local via the runtime's tr-TR formatter. */
export function formatClockTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "18:30–20:00" pickup window from two ISO instants. */
export function formatPickupWindow(startIso: string, endIso: string): string {
  return `${formatClockTime(startIso)}–${formatClockTime(endIso)}`;
}

/** A live HH:MM:SS clock face — used by the redeem screen's ticking clock. */
export function formatClockWithSeconds(date: Date): string {
  return date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "12 Ağu" day+month, used on order history rows. */
export function formatShortDate(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

/** mm:ss countdown from a millisecond duration, floored at 00:00. */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** kg from grams, one decimal — impact stats come back as integer grams. */
export function formatKg(grams: number): string {
  return (grams / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}
