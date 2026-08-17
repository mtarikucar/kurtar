-- Reverses 20260815210000_reservation_consumer_redeem/migration.sql.
-- IF EXISTS throughout so this is safe to re-run and a clean no-op if
-- already reverted.
ALTER TABLE "reservations" DROP COLUMN IF EXISTS "redeemedByActorType";
ALTER TABLE "reservations" DROP COLUMN IF EXISTS "redeemedByUserId";
