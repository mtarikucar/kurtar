/**
 * Deadline urgency classification shared by the two regulatory countdowns
 * in this app: complaints (ETAHS, 15 calendar days) and content reports
 * (48h takedown). Both list endpoints compute the remaining milliseconds
 * SERVER-SIDE (`AdminComplaintListItemDto.slaCountdownMs` /
 * `AdminReportListItemDto.takedownCountdownMs` — "negative once breached"
 * per their own doc comments in backend/src/modules/{complaints,
 * moderation}/dto/*.ts) — this module only classifies and formats that
 * number, it never recomputes a deadline from the client's own clock.
 */

export type DeadlineUrgency = "safe" | "warning" | "critical" | "breached";

export interface DeadlineThresholds {
  /** At or below this many ms remaining -> "critical". */
  criticalMs: number;
  /** At or below this many ms remaining (and above criticalMs) -> "warning". */
  warningMs: number;
}

/**
 * 15-day (360h) ETAHS complaint SLA. `warningMs` (48h) is NOT a guess — it
 * is the exact `COMPLAINT_SLA_WARNING_WINDOW_MS` the backend itself uses
 * to compute `AdminDashboardResponseDto.complaintsSlaAtRisk`
 * (backend/src/modules/complaints/sla-date-math.ts) and to trigger the SLA
 * cron's own warning alert, so this badge's WARNING boundary always
 * matches what the dashboard tile counts as "at risk" — no separate,
 * disagreeing definition of "at risk" in this app. `criticalMs` (24h, a
 * quarter of the warning window) is this app's own tighter subdivision,
 * giving a complaint a visibly distinct "still fine" state for most of its
 * 15 days before escalating in the final day.
 */
export const COMPLAINT_SLA_THRESHOLDS: DeadlineThresholds = {
  criticalMs: 24 * 60 * 60 * 1000,
  warningMs: 48 * 60 * 60 * 1000,
};

/**
 * 48h content-report takedown deadline. `warningMs` (12h) mirrors the
 * backend's own `TAKEDOWN_WARNING_WINDOW_MS`
 * (backend/src/modules/moderation/takedown-date-math.ts) exactly, for the
 * same reason as above. `criticalMs` (3h, a quarter of that) is this app's
 * own tighter subdivision.
 */
export const REPORT_TAKEDOWN_THRESHOLDS: DeadlineThresholds = {
  criticalMs: 3 * 60 * 60 * 1000,
  warningMs: 12 * 60 * 60 * 1000,
};

/**
 * Settlement payout due date. `SettlementBatch.dueAt` is already the exact
 * business-day-computed instant (`addBusinessDays(calculatedAt, 5)` —
 * backend/src/modules/settlements/settlement-batch-builder.service.ts's
 * `PAYOUT_DUE_BUSINESS_DAYS`), so treating `dueAt - now` as a plain
 * millisecond countdown needs no further business-day arithmetic on this
 * side. `criticalMs`/`warningMs` are this app's own judgment call (not a
 * backend-defined "at risk" constant like the two thresholds above): <=1
 * day is CRITICAL, <=2 days is WARNING, giving a payout obligation a
 * visibly distinct final stretch before the legal 5-business-day window
 * closes.
 */
export const SETTLEMENT_DUE_THRESHOLDS: DeadlineThresholds = {
  criticalMs: 24 * 60 * 60 * 1000,
  warningMs: 2 * 24 * 60 * 60 * 1000,
};

/**
 * `msRemaining === 0` (the exact deadline instant) classifies as BREACHED,
 * not merely "critical" — for a legal deadline, zero time remaining means
 * the deadline has already been reached, not that it is merely close.
 */
export function classifyDeadline(
  msRemaining: number,
  thresholds: DeadlineThresholds,
): DeadlineUrgency {
  if (msRemaining <= 0) return "breached";
  if (msRemaining <= thresholds.criticalMs) return "critical";
  if (msRemaining <= thresholds.warningMs) return "warning";
  return "safe";
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
}

/** Breaks a non-negative millisecond duration into whole days/hours/
 * minutes for display. Callers pass `Math.abs(msRemaining)` for an
 * already-breached (negative) countdown — this function never inspects
 * sign itself, `classifyDeadline` above is the one place that does. */
export function toCountdownParts(absoluteMs: number): CountdownParts {
  const totalMinutes = Math.floor(absoluteMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return { days, hours, minutes };
}
