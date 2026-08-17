-- Down migration for 20260814210000_membership_vat_writeoff_and_settlement_guards.
-- Drops exactly the 7 columns `up` added. Safe to re-run (IF EXISTS).

ALTER TABLE "settlement_batches" DROP COLUMN IF EXISTS "payoutAttemptedAt";
ALTER TABLE "settlement_batches" DROP COLUMN IF EXISTS "shortfallResolvedAt";
ALTER TABLE "settlement_batches" DROP COLUMN IF EXISTS "carriedExternalDemandCents";
ALTER TABLE "settlement_batches" DROP COLUMN IF EXISTS "membershipOffsetVatCents";

ALTER TABLE "membership_subscriptions" DROP COLUMN IF EXISTS "writtenOffCents";
ALTER TABLE "membership_subscriptions" DROP COLUMN IF EXISTS "outstandingVatCents";
ALTER TABLE "membership_subscriptions" DROP COLUMN IF EXISTS "vatCents";
