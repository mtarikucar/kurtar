-- Down migration for 20260812223000_merchant_owner_name_and_offer_publish_at.
-- Reverses both column additions. Both are plain DROP COLUMN IF EXISTS —
-- neither introduced a constraint, index, or FK that needs unwinding first,
-- so there is no ordering hazard between the two statements.

ALTER TABLE "daily_offers" DROP COLUMN IF EXISTS "publishAt";
ALTER TABLE "merchant_users" DROP COLUMN IF EXISTS "name";
