/** Formatting helpers — Turkish locale throughout (₺ money, tr-TR dates/times). */
import { formatMoneyCents } from "@kurtar/ui-tokens";

/** [M9 fix] kurtar is Turkey-only, and every instant this app renders
 * (pickup windows, cancel deadlines, the live redeem clock) is a business
 * instant the consumer needs read against Turkey's clock — not whatever
 * zone their device happens to be set to (an auto-set device clock covers
 * almost the whole user base, but not a traveller/expat with a manually
 * pinned foreign clock, or a Jest/emulator environment defaulting to
 * UTC). Mirrors apps/merchant-web/src/shared/format.ts, which already
 * pins this. */
const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

/** Cents (kuruş) -> "₺49,90". Every price in the API is an integer cents
 * field. Re-exported from the shared `@kurtar/ui-tokens` formatter — this
 * app's own hand-rolled version used to suffix the symbol ("49,90 ₺"),
 * diverging from merchant-web/admin-web/landing's shared "₺49,90" prefix
 * convention (Task 14's consistency sweep found the mismatch). */
export const formatPriceCents = formatMoneyCents;

/** A rounded value-band, e.g. "₺150–200" — original value min/max are
 * always whole-lira-ish cents. Prefixed, matching `formatPriceCents`'s own
 * "₺49,90" convention (this used to suffix the symbol instead — an
 * intra-screen mismatch, since the two render right next to each other on
 * the offer row — see app/store/[id].tsx). */
export function formatValueBand(minCents: number, maxCents: number): string {
  const min = Math.round(minCents / 100);
  const max = Math.round(maxCents / 100);
  if (min === max) return `~₺${min}`;
  return `₺${min}–${max}`;
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
    timeZone: ISTANBUL_TIME_ZONE,
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
    timeZone: ISTANBUL_TIME_ZONE,
  });
}

/** "12 Ağu" day+month, used on order history rows. */
export function formatShortDate(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: ISTANBUL_TIME_ZONE,
  });
}

/**
 * The calendar day an instant falls on IN İSTANBUL, as a sortable
 * "YYYY-MM-DD" key — the only honest way to answer "is this today?" for
 * copy that says BUGÜN.
 *
 * `en-CA` is not a locale choice, it is the shortest route to ISO order
 * from `toLocaleDateString`; the locale never reaches a user, only the
 * timezone matters. Comparing raw timestamps or UTC dates would call
 * 00:30 in İstanbul "yesterday" for the whole first three hours of every
 * day — exactly when a late pickup window is being read.
 */
export function istanbulGunAnahtari(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString("en-CA", { timeZone: ISTANBUL_TIME_ZONE });
}

/** Do these two instants fall on the same İstanbul day? The one question
 * a screen has to answer before it is allowed to print "BUGÜN". */
export function ayniIstanbulGunu(a: string | Date, b: string | Date): boolean {
  return istanbulGunAnahtari(a) === istanbulGunAnahtari(b);
}

/**
 * [M5 fix] Range-aware remaining-time text — replaces `formatCountdown`
 * (mm:ss), which had no hour rollover: a pickup hours away used to render
 * e.g. "420:00" next to its "18:30" absolute time. <1h -> minutes only;
 * <24h -> hours + minutes (dropping a redundant " 0 dk" tail); >=24h ->
 * days + hours. Floored at "0 dk", never negative.
 */
export function formatRemaining(msRemaining: number): string {
  const totalMinutes = Math.max(0, Math.floor(msRemaining / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} dk`;

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) {
    return minutes > 0 ? `${totalHours} sa ${minutes} dk` : `${totalHours} sa`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days} gün ${hours} sa` : `${days} gün`;
}

/** kg from grams, one decimal — impact stats come back as integer grams. */
export function formatKg(grams: number): string {
  return (grams / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}
