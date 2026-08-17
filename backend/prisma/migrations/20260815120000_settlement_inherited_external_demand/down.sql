-- Reverses 20260815120000_settlement_inherited_external_demand/migration.sql.
-- No production data exists anywhere this migration runs; safe forward-only
-- column, IF EXISTS makes this idempotent / safe to re-run.
ALTER TABLE "settlement_batches"
  DROP COLUMN IF EXISTS "inheritedExternalDemandCents";
