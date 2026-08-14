-- Down migration for 20260814193000_settlements_membership_pricing.
--
-- Reverses every object `up` created, in reverse dependency order. Safe to
-- re-run (IF EXISTS / scoped DELETE by fixed id everywhere). The
-- SettlementStatus enum revert is LAST and will legitimately fail (cast
-- error) if any settlement_batches row currently has status='HELD' — the
-- same "unsafe to revert while data depends on it" posture as dropping a
-- populated column, not a bug in this script.

-- Delete exactly the seed row `up` inserted, by its fixed id — never a
-- table-wide DELETE, so any admin-created PlatformPricing row (e.g. from
-- POST /api/admin/pricing) is left untouched.
DELETE FROM "platform_pricing" WHERE "id" = 'seed_platform_pricing_initial';

-- Drop the clawback FK before dropping the table it targets is unnecessary
-- here (settlement_batches isn't being dropped), but drop it explicitly
-- before its column for a clean, order-independent revert.
ALTER TABLE "settlement_lines" DROP CONSTRAINT IF EXISTS "settlement_lines_clawbackBatchId_fkey";

DROP INDEX IF EXISTS "platform_pricing_effectiveFrom_idx";
DROP TABLE IF EXISTS "platform_pricing";

ALTER TABLE "commission_invoices" DROP COLUMN IF EXISTS "vatCents";
ALTER TABLE "commission_invoices" DROP COLUMN IF EXISTS "totalAmountCents";
ALTER TABLE "commission_invoices" DROP COLUMN IF EXISTS "netAmountCents";
ALTER TABLE "commission_invoices" DROP COLUMN IF EXISTS "linesJson";

DROP INDEX IF EXISTS "membership_subscriptions_merchantId_key";
ALTER TABLE "membership_subscriptions" DROP COLUMN IF EXISTS "periodPaidAt";
ALTER TABLE "membership_subscriptions" DROP COLUMN IF EXISTS "outstandingCents";

ALTER TABLE "settlement_lines" DROP COLUMN IF EXISTS "clawbackCents";
ALTER TABLE "settlement_lines" DROP COLUMN IF EXISTS "clawbackBatchId";
ALTER TABLE "settlement_lines" DROP COLUMN IF EXISTS "clawbackAppliedAt";
ALTER TABLE "settlement_lines" DROP COLUMN IF EXISTS "bagFeeVatCents";

ALTER TABLE "settlement_batches" DROP COLUMN IF EXISTS "holdReason";
ALTER TABLE "settlement_batches" DROP COLUMN IF EXISTS "carriedShortfallCents";
ALTER TABLE "settlement_batches" DROP COLUMN IF EXISTS "bagFeeVatCents";

ALTER TABLE "merchants" DROP COLUMN IF EXISTS "membershipExemptUntil";
ALTER TABLE "merchants" DROP COLUMN IF EXISTS "bagFeeCentsOverride";

-- Remove SettlementStatus.HELD. Postgres cannot drop a single enum value
-- directly — rebuild the type without it and re-point the column, which
-- fails loudly (a cast error) if any row is currently 'HELD'.
ALTER TYPE "SettlementStatus" RENAME TO "SettlementStatus_old";
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'CALCULATED', 'APPROVED', 'SENT', 'SETTLED', 'FAILED');
ALTER TABLE "settlement_batches" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "settlement_batches" ALTER COLUMN "status" TYPE "SettlementStatus" USING ("status"::text::"SettlementStatus");
ALTER TABLE "settlement_batches" ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "SettlementStatus_old";
