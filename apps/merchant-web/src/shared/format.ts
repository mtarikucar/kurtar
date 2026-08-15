/** Money/date formatting helpers — the ONE place each format is defined, so
 * every screen renders kuruş/dates identically. */

const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Kuruş (Int, always the wire unit — see backend/prisma/schema.prisma's
 * money convention) -> a formatted "₺59,00" string. */
export function formatKurus(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

const timeFormatter = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "short",
});

const weekdayFormatter = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  weekday: "short",
});

export function formatTime(value: string | Date): string {
  return timeFormatter.format(new Date(value));
}

export function formatDate(value: string | Date): string {
  return dateFormatter.format(new Date(value));
}

export function formatShortDate(value: string | Date): string {
  return shortDateFormatter.format(new Date(value));
}

export function formatWeekday(value: string | Date): string {
  return weekdayFormatter.format(new Date(value));
}

/** "YYYY-MM-DD" for today, in Europe/Istanbul local time — mirrors the
 * backend's istanbulDateKey (backend/src/common/utils/istanbul-date.util.ts)
 * so the calendar day this client thinks is "today" always agrees with the
 * server's, even for a browser in another timezone. */
export function istanbulDateKey(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

/** Adds `days` calendar days to an Istanbul date key, returning a new key. */
export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return istanbulDateKey(base);
}

/** "YYYY-MM-DD" + "HH:mm" Istanbul local time -> the UTC instant ISO
 * string the backend expects (`@IsDateString()` fields like
 * pickupStartAt/pickupEndAt/publishAt). Turkey has used a fixed UTC+3
 * offset since 2016 (no DST) — see backend/src/modules/settlements/
 * business-days.ts's own comment for the same fact — so a literal "+03:00"
 * offset is correct today and cheap to revisit if that ever changes. */
export function istanbulLocalToIsoInstant(
  dateKey: string,
  time: string,
): string {
  return new Date(`${dateKey}T${time}:00+03:00`).toISOString();
}

/** The 7 Istanbul date keys of the calendar week (Monday-first) containing
 * `dateKey`. */
export function weekKeysContaining(dateKey: string): string[] {
  const [y, m, d] = dateKey.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const isoWeekday = noon.getUTCDay() === 0 ? 7 : noon.getUTCDay(); // 1=Mon..7=Sun
  const monday = addDaysToKey(dateKey, 1 - isoWeekday);
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
}
