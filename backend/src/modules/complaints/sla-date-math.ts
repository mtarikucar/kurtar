/**
 * Pure SLA date math (brief §4) — no framework imports.
 *
 * ETAHS (Elektronik Ticaret Aracı Hizmet Sağlayıcısı — Turkey's e-commerce
 * intermediary regulation) wording for the complaint-response window is
 * CALENDAR days, not business days — unlike Task 8's settlement due date,
 * which is explicitly business days. Turkey has observed no daylight-
 * saving-time shift since 2016 (fixed UTC+3 year-round), so plain
 * millisecond arithmetic and an Istanbul-calendar-day walk produce the
 * identical instant; this uses `Date.setDate`, which reads as "add N
 * calendar days" more directly than a raw `+N*86400000` (both are
 * correct here — DST would need the Istanbul-anchored version were that
 * ever not true).
 */
export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/** ETAHS complaint response SLA — 15 calendar days from creation. */
export const COMPLAINT_SLA_DAYS = 15;

/** How close to the deadline the SLA cron starts alerting ops
 * (complaint-sla-cron.service.ts) — 48h, matching the content-report
 * takedown window's own total length for a consistent "you have about
 * two days" operator experience across both surfaces. */
export const COMPLAINT_SLA_WARNING_WINDOW_HOURS = 48;
export const COMPLAINT_SLA_WARNING_WINDOW_MS =
  COMPLAINT_SLA_WARNING_WINDOW_HOURS * 60 * 60 * 1000;

export function computeComplaintSlaDeadline(createdAt: Date): Date {
  return addCalendarDays(createdAt, COMPLAINT_SLA_DAYS);
}
