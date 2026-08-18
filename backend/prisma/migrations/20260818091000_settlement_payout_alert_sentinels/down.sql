-- Reverses 20260818091000_settlement_payout_alert_sentinels/migration.sql.
-- IF EXISTS throughout so this is safe to re-run and a clean no-op if
-- already reverted. Touches only the three columns that migration added.
ALTER TABLE "settlement_batches"
  DROP COLUMN IF EXISTS "reconciliationAlertSentAt",
  DROP COLUMN IF EXISTS "payoutDueWarningSentAt",
  DROP COLUMN IF EXISTS "payoutOverdueAlertSentAt";
