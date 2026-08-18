-- [Fix round #6, I3/I4/M3] Alert sentinels for the daily settlement
-- reconciliation sweep (settlement-payout.service.ts's
-- reconcileStuckBatches).
--
-- Before this, that cron re-emitted one `logger.error("CRITICAL: ...")`
-- per matching batch on every 09:00 tick, with no sentinel, no LIMIT and
-- no ORDER BY. Nothing in the codebase ever writes SETTLED, so the
-- stale-SENT branch's match set was monotonically growing and unclearable
-- by construction: the same CRITICAL lines, for the same batches, every
-- day, forever — which is also what buried the OTHER branch, the one
-- carrying the regulated 5-business-day payout deadline.
--
-- These three columns give each alert the same alert-once discipline
-- complaint_tickets."slaWarningSentAt" already has: a guarded
-- `UPDATE ... WHERE sentinel IS NULL ... RETURNING` both selects and
-- claims a batch atomically, so two ticks (or two instances) can never
-- double-alert the same row, and a batch alerts once instead of daily.
--
--   "reconciliationAlertSentAt" — SENT but not SETTLED 3+ days on.
--   "payoutDueWarningSentAt"    — one business day out from dueAt (NEW:
--                                 the deadline had no pre-breach warning
--                                 at all).
--   "payoutOverdueAlertSentAt"  — past dueAt while still unsent.
--
-- All three NULLABLE with no DEFAULT — safe on a non-empty table, and
-- NULL already means exactly "not alerted yet" for every existing row.
ALTER TABLE "settlement_batches"
  ADD COLUMN IF NOT EXISTS "reconciliationAlertSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payoutDueWarningSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payoutOverdueAlertSentAt" TIMESTAMP(3);
