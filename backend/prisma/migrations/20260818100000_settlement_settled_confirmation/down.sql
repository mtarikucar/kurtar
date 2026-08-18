-- Reverses 20260818100000_settlement_settled_confirmation/migration.sql.
-- IF EXISTS throughout so this is safe to re-run and a clean no-op if
-- already reverted. Touches only the two columns that migration added;
-- no row is deleted and no status is rewritten (a batch left in SETTLED
-- stays SETTLED — the enum value predates this migration).
ALTER TABLE "settlement_batches"
  DROP COLUMN IF EXISTS "settledAt",
  DROP COLUMN IF EXISTS "settlementReference";
