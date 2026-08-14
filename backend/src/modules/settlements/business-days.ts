import { istanbulDateKey } from "../../common/utils/istanbul-date.util";

/**
 * Europe/Istanbul business-day calendar — pure, no framework/DB imports
 * (PublicHolidayService, which reads the `public_holidays` table, is the
 * thin caller-facing wrapper; this file only ever sees a plain
 * `ReadonlySet<string>` of "YYYY-MM-DD" holiday keys so it stays testable
 * without a database).
 *
 * Every date in/out of this file is represented as an Istanbul calendar-day
 * key ("YYYY-MM-DD", via istanbul-date.util's istanbulDateKey) or the fixed
 * UTC-midnight instant for that key (offerDateToDbDate's convention) — never
 * a naive 24h-in-UTC increment, so this is correct even if Turkey ever
 * reintroduces DST (it has used a fixed UTC+3 offset since 2016, so today
 * the two happen to coincide, but the calendar-key arithmetic below does
 * not depend on that).
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Weekday of an Istanbul calendar date: 0=Sunday .. 6=Saturday. Computed
 * off a fixed UTC-NOON instant for the date, deliberately not UTC-midnight
 * — noon UTC is always 15:00 Istanbul, nowhere near either the Istanbul or
 * the UTC calendar-day boundary, so `getUTCDay()` on it can never
 * misreport the intended calendar day regardless of which offset Istanbul
 * observes. */
function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

/** The next Istanbul calendar day after `dateKey`, as a key. Re-derives via
 * istanbulDateKey rather than trusting a raw +24h UTC add to land on the
 * right key — cheap insurance if Istanbul's offset ever changes; today the
 * two are equivalent. */
function nextCalendarDayKey(dateKey: string): string {
  const nextInstant =
    new Date(`${dateKey}T12:00:00.000Z`).getTime() + ONE_DAY_MS;
  return istanbulDateKey(new Date(nextInstant));
}

/** A calendar day (key form) is a business day iff it is not a Saturday/
 * Sunday AND not present in `holidays`. A holiday that happens to fall on a
 * weekend is simply redundant with the weekend rule — `isBusinessDay`
 * returns `false` for it either way, exactly once, never double-counted by
 * `addBusinessDays` (which only decrements its counter on a `true`). */
export function isBusinessDay(
  dateKey: string,
  holidays: ReadonlySet<string>,
): boolean {
  const weekday = weekdayOf(dateKey);
  if (weekday === 0 || weekday === 6) return false;
  return !holidays.has(dateKey);
}

/**
 * `date` + `n` BUSINESS days (Europe/Istanbul calendar), returned as the
 * fixed UTC-midnight instant for the resulting calendar day.
 *
 * Counts strictly AFTER `date` — `date` itself is day 0 and is never
 * counted even if it is itself a business day, matching the conventional
 * "T+5 business days" reading settlements.service.ts relies on (a Monday
 * redemption's 5-business-day due date is the FOLLOWING Monday: Tue, Wed,
 * Thu, Fri, Mon).
 *
 * `n` must be a non-negative integer; `n = 0` returns `date`'s own
 * calendar day unchanged (even if `date` itself is a weekend/holiday —
 * this function only steps FORWARD from a start point, it never adjusts
 * the start point itself).
 */
export function addBusinessDays(
  date: Date,
  n: number,
  holidays: ReadonlySet<string>,
): Date {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(
      `addBusinessDays: n must be a non-negative integer, got ${n}`,
    );
  }

  let cursor = istanbulDateKey(date);
  let remaining = n;
  while (remaining > 0) {
    cursor = nextCalendarDayKey(cursor);
    if (isBusinessDay(cursor, holidays)) {
      remaining--;
    }
  }
  return new Date(`${cursor}T00:00:00.000Z`);
}
