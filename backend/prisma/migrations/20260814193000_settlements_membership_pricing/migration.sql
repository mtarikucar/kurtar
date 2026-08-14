-- Task 8: settlement engine + membership offset + commission invoicing —
-- schema additions over the models Task 2 already created but left unused
-- (SettlementBatch/SettlementLine/CommissionInvoice/MembershipSubscription/
-- PublicHoliday). Every addition below is nullable or DEFAULTed, so this is
-- safe against the existing (empty, in practice — nothing has written these
-- tables yet) rows.
--
-- 1. SettlementStatus.HELD — a batch whose arithmetic would have gone
--    negative (settlement-math.ts's never-negative-net invariant), or one
--    an admin manually paused (POST .../:id/hold). Distinguished from the
--    two by settlement_batches.holdReason, not a second enum value.
--
-- 2. merchants.bagFeeCentsOverride / membershipExemptUntil — founding-
--    member commercial terms: a locked-lower fixed bag fee, and a first-
--    year membership exemption. Both nullable; NULL means "platform
--    default applies".
--
-- 3. settlement_batches.bagFeeVatCents / carriedShortfallCents /
--    holdReason — KDV on the bag fee tracked separately from the fee
--    itself; the exact deficit a HELD batch couldn't cover, carried into
--    computing the merchant's next batch; why a batch is HELD.
--
-- 4. settlement_lines.bagFeeVatCents / clawbackCents / clawbackAppliedAt /
--    clawbackBatchId — per-line VAT (mirrors the batch column, sums up to
--    it); the refund-after-payout clawback bookkeeping. clawbackAppliedAt
--    IS NULL is the eligibility guard the clawback sweep queries on, so a
--    line can only ever be clawed back once — see
--    settlements/settlements.service.ts's clawback sweep.
--
-- 5. commission_invoices.netAmountCents / vatCents / totalAmountCents /
--    linesJson — this table had no amount columns at all; an e-invoice
--    needs one. Withholding is DELIBERATELY never one of these (it is a
--    tevkifat on the payout dekont, not a commission-invoice line — brief
--    §6; see invoicing/commission-invoice.service.ts).
--
-- 6. platform_pricing (new table) — bagFeeCents / membershipAnnualCents,
--    indexed by effectiveFrom so a price change is a NEW row, never an
--    UPDATE of history (settlements/pricing.service.ts resolves "as of" a
--    batch's own period date). Seeded below with the platform's initial
--    pricing, effective from before this migration ever runs in practice
--    — every real settlement period lookup is guaranteed to find a row.

-- AlterEnum
ALTER TYPE "SettlementStatus" ADD VALUE 'HELD';

-- AlterTable: merchants
ALTER TABLE "merchants" ADD COLUMN     "bagFeeCentsOverride" INTEGER,
ADD COLUMN     "membershipExemptUntil" TIMESTAMP(3);

-- AlterTable: settlement_batches
ALTER TABLE "settlement_batches" ADD COLUMN     "bagFeeVatCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "carriedShortfallCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "holdReason" TEXT;

-- AlterTable: settlement_lines
ALTER TABLE "settlement_lines" ADD COLUMN     "bagFeeVatCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clawbackAppliedAt" TIMESTAMP(3),
ADD COLUMN     "clawbackBatchId" TEXT,
ADD COLUMN     "clawbackCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: membership_subscriptions
ALTER TABLE "membership_subscriptions" ADD COLUMN     "outstandingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "periodPaidAt" TIMESTAMP(3);

-- Exactly one subscription per merchant — see the model's doc comment in
-- schema.prisma. Safe against existing data: no MembershipSubscription
-- row has ever been written (this task is what starts writing this table).
CREATE UNIQUE INDEX "membership_subscriptions_merchantId_key" ON "membership_subscriptions"("merchantId");

-- AlterTable: commission_invoices
ALTER TABLE "commission_invoices" ADD COLUMN     "linesJson" JSONB,
ADD COLUMN     "netAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: platform_pricing
CREATE TABLE "platform_pricing" (
    "id" TEXT NOT NULL,
    "bagFeeCents" INTEGER NOT NULL,
    "membershipAnnualCents" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_pricing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_pricing_effectiveFrom_idx" ON "platform_pricing"("effectiveFrom");

-- AddForeignKey: settlement_lines.clawbackBatchId -> settlement_batches.id
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_clawbackBatchId_fkey" FOREIGN KEY ("clawbackBatchId") REFERENCES "settlement_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the platform's initial pricing. effectiveFrom is set to well before
-- this migration can ever run in a real deploy (no reservation — hence no
-- settlement period — can predate the application's own existence), so
-- PricingService's "as of period date" lookup always resolves a row, for
-- every real period date, from the moment this migration applies.
-- ON CONFLICT is a defensive no-op guard (id is a fresh cuid so a genuine
-- conflict is not expected) matching this repo's idempotent-up convention.
INSERT INTO "platform_pricing" ("id", "bagFeeCents", "membershipAnnualCents", "effectiveFrom", "createdAt")
VALUES ('seed_platform_pricing_initial', 2500, 199000, '2026-01-01T00:00:00.000Z', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
