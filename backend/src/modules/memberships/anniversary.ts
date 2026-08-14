import { istanbulDateKey } from "../../common/utils/istanbul-date.util";

/**
 * Pure membership-anniversary math — no framework imports (mirrors
 * settlements/business-days.ts). The renewal date is the SAME calendar
 * day each year, in Europe/Istanbul (brief §4).
 */

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * `anchorDate`'s Istanbul calendar day, advanced by `yearsToAdd` full
 * years, landing on the same month/day.
 *
 * Feb-29 policy (brief's explicit "handle Feb-29 -> Feb-28" ask): if the
 * anchor day is itself Feb 29 (only possible when the merchant was
 * approved in a leap year) and the TARGET year is not a leap year, the
 * anniversary falls on Feb 28 that year instead of skipping to Mar 1 or
 * jumping ahead to the next Feb 29. This is a deliberate product choice —
 * the membership year is always ~365 days, never padded to ~366 or ~1461
 * — not an edge-case bug: a merchant approved 2028-02-29 renews on
 * 2029-02-28, 2030-02-28, 2031-02-28, then back to 2032-02-29 once that
 * date exists again.
 *
 * Returns the fixed UTC-midnight instant for the resulting Istanbul
 * calendar day (offerDateToDbDate's convention).
 */
export function addAnniversaryYears(
  anchorDate: Date,
  yearsToAdd: number,
): Date {
  if (!Number.isInteger(yearsToAdd) || yearsToAdd <= 0) {
    throw new Error(
      `addAnniversaryYears: yearsToAdd must be a positive integer, got ${yearsToAdd}`,
    );
  }

  const [yearStr, monthStr, dayStr] = istanbulDateKey(anchorDate).split("-");
  const year = Number(yearStr) + yearsToAdd;
  const month = Number(monthStr);
  let day = Number(dayStr);

  if (month === 2 && day === 29 && !isLeapYear(year)) {
    day = 28;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return new Date(`${year}-${mm}-${dd}T00:00:00.000Z`);
}
