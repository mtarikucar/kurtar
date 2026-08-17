-- Down migration for 20260814120000_outbox_claimed_at_lease.

DROP INDEX IF EXISTS "outbox_events_status_claimedAt_idx";
ALTER TABLE "outbox_events" DROP COLUMN IF EXISTS "claimedAt";
