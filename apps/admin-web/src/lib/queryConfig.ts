/**
 * Shared React Query polling cadence for data that backs a live,
 * server-computed countdown (`slaCountdownMs`, `takedownCountdownMs`,
 * `dueAt`) rather than a value that only changes on an explicit action.
 *
 * [I10 fix] Without a `refetchInterval`, a query fetched once at mount
 * time never re-syncs on its own — React Query's default `refetchOnMount`
 * only refires on a fresh navigation, not while a tab stays open. For an
 * always-open ops console, that leaves the SLA/takedown badges frozen at
 * whatever the server said at fetch time: the drift is always in the
 * UNSAFE direction (shows MORE time remaining than actually remains), and
 * a report that crosses into CRITICAL while the tab is open never
 * re-styles or enters the AT_RISK filter until someone manually refetches.
 *
 * 60s matches the dashboard's own four queries (useDashboardData.ts),
 * which already polled at this cadence before this fix — one constant,
 * one place to change it.
 */
export const DEADLINE_REFRESH_INTERVAL_MS = 60_000;
