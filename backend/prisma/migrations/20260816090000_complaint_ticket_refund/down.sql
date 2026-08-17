-- Reverses 20260816090000_complaint_ticket_refund/migration.sql.
-- IF EXISTS throughout so this is safe to re-run and a clean no-op if
-- already reverted.
ALTER TABLE "complaint_tickets" DROP COLUMN IF EXISTS "refundedAt";
