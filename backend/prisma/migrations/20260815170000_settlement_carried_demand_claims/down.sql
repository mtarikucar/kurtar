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

-- The forward backfill is deliberately NOT reversed, and does not need to
-- be: it only ever RECONSTRUCTED this table (and the pin column) from
-- settlement_batches.inheritedExternalDemandCents, which this revert
-- leaves completely untouched. So the column that survives still holds
-- every amount, and re-applying the up rebuilds identical claim rows from
-- it — the down/up cycle is identity-preserving on a populated database,
-- not merely non-destructive on an empty one.
