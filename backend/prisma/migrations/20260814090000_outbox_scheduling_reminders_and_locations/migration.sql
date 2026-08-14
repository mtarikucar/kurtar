-- Task 7: outbox worker + notifications — four small, independent schema
-- additions surfaced while wiring the drain worker and its event handlers.
--
-- 1. outbox_events.idempotencyKey: DROP NOT NULL + add a real UNIQUE index.
--    Every producer today (offers.service.ts's publish/cancel) already sets
--    it on every row, so this is safe against current data (verified: no
--    existing duplicates, no existing NULLs). Nullable because a future
--    producer with no natural dedup key should be free to omit it — a
--    plain NOT NULL UNIQUE would force every producer to invent one.
--    Postgres unique indexes treat each NULL as distinct, so any number of
--    keyless rows may coexist once this is nullable.
--
-- 2. outbox_events.scheduledFor: nullable delayed-dispatch marker. NULL
--    (every existing row) means "eligible immediately"; a future instant
--    defers OutboxWorkerService's claim query until it has passed — used
--    by the reservation.redeemed.v1 rating-invite event (queued at redeem
--    time, dispatched 2 hours later).
--
-- 3. reservations.pickupReminderSentAt: nullable sentinel the pickup-
--    reminder cron sets in the same guarded UPDATE that decides to push,
--    so a reservation can never be reminded twice.
--
-- 4. users.lastLat / lastLng / lastLocationAt: nullable last-known-device-
--    location triple, written by POST /api/me/location. Powers the
--    offer.published.v1 nearby-radius fan-out (ST_DWithin against
--    stores.location). All three are nullable and always written together
--    — a user who never granted location permission simply has all three
--    NULL and never qualifies for nearby notifications.

-- AlterTable: outbox_events.idempotencyKey + scheduledFor
ALTER TABLE "outbox_events" ALTER COLUMN "idempotencyKey" DROP NOT NULL;
CREATE UNIQUE INDEX "outbox_events_idempotencyKey_key" ON "outbox_events"("idempotencyKey");
ALTER TABLE "outbox_events" ADD COLUMN "scheduledFor" TIMESTAMP(3);

-- AlterTable: reservations.pickupReminderSentAt
ALTER TABLE "reservations" ADD COLUMN "pickupReminderSentAt" TIMESTAMP(3);

-- AlterTable: users.lastLat / lastLng / lastLocationAt
ALTER TABLE "users" ADD COLUMN "lastLat" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "lastLng" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "lastLocationAt" TIMESTAMP(3);
