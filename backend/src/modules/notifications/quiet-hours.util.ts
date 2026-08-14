import { istanbulHourOfDay } from "../../common/utils/istanbul-date.util";

/**
 * True when `now` falls inside the [start, end) quiet-hours window, in
 * Europe/Istanbul local hour-of-day. Used only for non-transactional
 * pushes (NotificationPolicyService) — transactional messages bypass this
 * entirely.
 *
 *   start === null || end === null  -> never in quiet hours (not configured)
 *   start === end                   -> degenerate/no-op config -> never in
 *                                       quiet hours (treated as "not set",
 *                                       not as "quiet all day" — a 24h
 *                                       silence would need an explicit,
 *                                       unambiguous UI affordance this
 *                                       schema doesn't have)
 *   start < end   (e.g. 9 -> 18)     -> quiet for hour in [start, end)
 *   start > end   (e.g. 22 -> 8)     -> wraps midnight: quiet for
 *                                       hour >= start OR hour < end
 */
export function isWithinQuietHours(
  quietHoursStart: number | null,
  quietHoursEnd: number | null,
  now: Date = new Date(),
): boolean {
  if (quietHoursStart === null || quietHoursEnd === null) return false;
  if (quietHoursStart === quietHoursEnd) return false;

  const hour = istanbulHourOfDay(now);
  if (quietHoursStart < quietHoursEnd) {
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }
  return hour >= quietHoursStart || hour < quietHoursEnd;
}
