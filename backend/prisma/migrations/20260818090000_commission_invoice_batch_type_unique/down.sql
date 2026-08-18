-- Reverses 20260818090000_commission_invoice_batch_type_unique/migration.sql.
-- IF EXISTS so this is safe to re-run and a clean no-op if already reverted.
DROP INDEX IF EXISTS "commission_invoices_batchId_type_key";
