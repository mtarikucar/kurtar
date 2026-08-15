-- Reverses 20260815170000_settlement_carried_demand_claims/migration.sql.
-- IF EXISTS throughout, so this is idempotent / safe to re-run, matching
-- every other down.sql in this folder.
--
-- Dropping the table takes its primary key, index, both foreign keys and
-- its CHECK constraint with it. The batch column's own foreign key goes
-- with the column.
DROP TABLE IF EXISTS "settlement_carried_demand_claims";

ALTER TABLE "settlement_clawback_allocations"
  DROP CONSTRAINT IF EXISTS "settlement_clawback_allocations_amount_positive";

ALTER TABLE "settlement_batches"
  DROP COLUMN IF EXISTS "carriedDemandSourceBatchId";

-- The inheritedExternalDemandCents backfill is deliberately NOT reversed.
-- It only ever CORRECTS rows that the column's own migration left at a
-- wrong 0, and the column keeps existing after this revert; writing those
-- rows back to 0 would re-introduce the very defect the backfill closes,
-- and there is no stored record of which rows the UPDATE actually touched.
-- A data correction to a surviving column has no meaningful inverse — the
-- same posture as the init migration's down.sql not dropping postgis.
