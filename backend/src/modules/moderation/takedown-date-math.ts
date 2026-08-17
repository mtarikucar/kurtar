/** Pure content-report takedown SLA math (brief §5) — no framework
 * imports. See complaints/sla-date-math.ts's doc comment for why
 * complaints use calendar days; the 48h takedown window is a plain
 * duration, no calendar-day framing needed. */
export const TAKEDOWN_SLA_HOURS = 48;
export const TAKEDOWN_SLA_MS = TAKEDOWN_SLA_HOURS * 60 * 60 * 1000;

/** How close to the 48h deadline the takedown cron starts alerting ops —
 * a quarter of the total window (12h), so "approaching" still leaves a
 * meaningful reaction time on a much shorter SLA than complaints' 15
 * days. */
export const TAKEDOWN_WARNING_WINDOW_HOURS = 12;
export const TAKEDOWN_WARNING_WINDOW_MS =
  TAKEDOWN_WARNING_WINDOW_HOURS * 60 * 60 * 1000;

export function computeTakedownDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + TAKEDOWN_SLA_MS);
}
