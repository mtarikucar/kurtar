/**
 * [M9 fix] Both formatters pin `timeZone: "Europe/Istanbul"` — without it,
 * `Intl.DateTimeFormat`'s `tr-TR` *locale* renders in the viewer's
 * device/OS timezone, not Istanbul (a locale controls script/calendar/
 * digit conventions, never the zone). kurtar is Turkey-only and every
 * instant this app renders (settlement periodStart/periodEnd/dueAt,
 * PlatformPricing effectiveFrom, complaint/report timestamps) is a
 * business instant the operator needs read against Turkey's clock, not
 * whatever zone their laptop happens to be set to — mirrors
 * apps/merchant-web/src/shared/format.ts, which already pins this.
 */
const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: ISTANBUL_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ISTANBUL_TIME_ZONE,
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateTimeFormatter.format(new Date(iso));
}
