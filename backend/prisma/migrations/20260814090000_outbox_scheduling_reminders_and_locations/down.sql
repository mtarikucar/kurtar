-- Down migration for 20260814090000_outbox_scheduling_reminders_and_locations.
-- Reverses each of the four additions in the sibling migration.sql, in
-- reverse order. Every DROP COLUMN is IF EXISTS, so this is safe to re-run.
--
-- Restoring outbox_events.idempotencyKey to NOT NULL is only safe if no row
-- has a NULL value at the moment this runs — true for every row this
-- migration's own `up` could ever have produced (this task's only
-- producers, offers.service.ts's publish/cancel via OutboxService, always
-- supply an idempotencyKey) and true for every pre-existing row (verified
-- against the current dev DB before writing this migration). A future
-- producer that deliberately omits idempotencyKey would need to backfill
-- before this down could run again — an acceptable trade-off for a
-- rollback path, not a concern for the up/down round-trip this pair is
-- verified against.

-- AlterTable: users.lastLat / lastLng / lastLocationAt
ALTER TABLE "users" DROP COLUMN IF EXISTS "lastLocationAt";
ALTER TABLE "users" DROP COLUMN IF EXISTS "lastLng";
ALTER TABLE "users" DROP COLUMN IF EXISTS "lastLat";

-- AlterTable: reservations.pickupReminderSentAt
ALTER TABLE "reservations" DROP COLUMN IF EXISTS "pickupReminderSentAt";

-- AlterTable: outbox_events.scheduledFor + idempotencyKey
ALTER TABLE "outbox_events" DROP COLUMN IF EXISTS "scheduledFor";
DROP INDEX IF EXISTS "outbox_events_idempotencyKey_key";
ALTER TABLE "outbox_events" ALTER COLUMN "idempotencyKey" SET NOT NULL;
