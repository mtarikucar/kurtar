-- Task 5: two small, genuinely-needed additions surfaced while wiring the
-- merchant signup and offer-scheduling endpoints — the Task 2 schema had no
-- column for either.
--
-- 1. merchant_users.name — POST /api/merchants/signup takes an `ownerName`
--    field (the signing owner/contact's display name) that had nowhere to
--    land; MerchantUser only carried email/passwordHash/role/lastLoginAt.
--    Added NOT NULL via the same interim-DEFAULT-then-drop pattern as the
--    prior migration's `principalType` column (safe for existing rows —
--    there are none yet in this pre-launch schema — and forces every
--    future INSERT to supply it explicitly once the default is dropped).
--
-- 2. daily_offers.publishAt — POST /api/offers/:id/schedule stores a
--    future publish time; the publish-scheduler cron selects SCHEDULED
--    rows with publishAt <= now(). Nullable: only ever set for offers that
--    went through /schedule, and never read again once an offer leaves
--    SCHEDULED.

-- AlterTable: merchant_users.name
ALTER TABLE "merchant_users" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "merchant_users" ALTER COLUMN "name" DROP DEFAULT;

-- AlterTable: daily_offers.publishAt
ALTER TABLE "daily_offers" ADD COLUMN "publishAt" TIMESTAMP(3);
