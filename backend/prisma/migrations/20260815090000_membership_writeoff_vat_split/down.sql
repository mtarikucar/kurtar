-- Reverses 20260815090000_membership_writeoff_vat_split/migration.sql.
-- No production data exists anywhere this migration runs; safe forward-only
-- column, IF EXISTS makes this idempotent / safe to re-run.
ALTER TABLE "membership_subscriptions"
  DROP COLUMN IF EXISTS "writtenOffVatCents";
