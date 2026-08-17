/**
 * Europe/Istanbul calendar-date helpers shared by the offers module
 * (offer-window.rules.ts's same-day pickup-window check,
 * offers.service.ts's default "today" for /offers/mine) and the discovery
 * module (today's-offers lookup on a store's public profile).
 */

const ISTANBUL_TZ = "Europe/Istanbul";

/** The Europe/Istanbul calendar date for `date`, as "YYYY-MM-DD". */
export function istanbulDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** DailyOffer.offerDate is `@db.Date` — represent a "YYYY-MM-DD" calendar
 * day as a fixed UTC midnight instant so the value round-trips
 * unambiguously regardless of the reading process's local timezone. */
export function offerDateToDbDate(offerDate: string): Date {
  return new Date(`${offerDate}T00:00:00.000Z`);
}

/** [Task 7] The Europe/Istanbul hour-of-day for `date`, as an integer
 * 0-23. Used by modules/notifications' quiet-hours check
 * (NotificationPreference.quietHoursStart/End are local hour-of-day
 * bounds, per schema.prisma's comment on that model). */
export function istanbulHourOfDay(date: Date): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISTANBUL_TZ,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  // "en-GB" + hour12:false formats as "HH" (occasionally "24" for
  // midnight in some ICU versions) — normalize "24" to 0.
  const hour = Number.parseInt(formatted, 10);
  return hour === 24 ? 0 : hour;
}
