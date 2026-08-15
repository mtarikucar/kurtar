-- [Fix round #5] Three things, all one story: make the carried-demand
-- handoff between a HELD predecessor and its successor a RECORDED,
-- RETIRABLE fact instead of an inferred copy — the same treatment
-- 20260815160000 gave per-line clawback attribution, applied to the other
-- half of priorClawbackCents.
--
-- (1) settlement_batches.carriedDemandSourceBatchId — the PINNED
--     predecessor. Discovered once, on a batch's first pass; pure
--     identity, no money. Pinning it is what stops a later pass from
--     silently re-targeting a different, newer sibling.
-- (2) settlement_carried_demand_claims — the live money claim, at most one
--     row per claimant, rebuilt from scratch on every pass. Because the
--     claim is recorded on the SOURCE's side too (indexed by
--     sourceBatchId), a predecessor whose deficit is cured — by a very
--     late line, which createOrExtendBatch deliberately allows on a HELD
--     batch, or by a bag-fee correction — now has the claim retired
--     instead of leaving the successor holding a frozen copy of a demand
--     that no longer exists and charging the merchant for it twice.
-- (3) CHECK ("amountCents" > 0) on BOTH ledgers, so "a zero contribution
--     is the ABSENCE of a row" is true at the level schema.prisma and
--     20260815160000 already assert it at, rather than only being upheld
--     by an application-side filter.
--
-- Prisma cannot express CHECK constraints in its datamodel and does not
-- introspect them, so these two are invisible to `prisma migrate diff` —
-- they add no permanent schema.prisma/migrations divergence (unlike
-- stores.location's GIST index, which is a real, documented one).

-- AlterTable
ALTER TABLE "settlement_batches" ADD COLUMN     "carriedDemandSourceBatchId" TEXT;

-- CreateTable
CREATE TABLE "settlement_carried_demand_claims" (
    "claimantBatchId" TEXT NOT NULL,
    "sourceBatchId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_carried_demand_claims_pkey" PRIMARY KEY ("claimantBatchId")
);

-- CreateIndex
CREATE INDEX "settlement_carried_demand_claims_sourceBatchId_idx" ON "settlement_carried_demand_claims"("sourceBatchId");

-- AddForeignKey
ALTER TABLE "settlement_batches" ADD CONSTRAINT "settlement_batches_carriedDemandSourceBatchId_fkey" FOREIGN KEY ("carriedDemandSourceBatchId") REFERENCES "settlement_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_carried_demand_claims" ADD CONSTRAINT "settlement_carried_demand_claims_claimantBatchId_fkey" FOREIGN KEY ("claimantBatchId") REFERENCES "settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_carried_demand_claims" ADD CONSTRAINT "settlement_carried_demand_claims_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- [Fix round #5, LOW 2] Invariant "amountCents > 0", enforced where it is
-- claimed. Both ledgers delete-and-reinsert rather than patch, so a row
-- can only ever be created with a positive amount.
ALTER TABLE "settlement_carried_demand_claims"
  ADD CONSTRAINT "settlement_carried_demand_claims_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "settlement_clawback_allocations"
  ADD CONSTRAINT "settlement_clawback_allocations_amount_positive" CHECK ("amountCents" > 0);

-- [Fix round #5, LOW 3] The inheritedExternalDemandCents backfill, moved
-- here out of 20260815120000. Editing an already-applied migration changes
-- its Prisma checksum, which `prisma migrate deploy` refuses against a
-- long-lived database (ops/release-deploy.yml runs exactly that) — so the
-- correction ships as a NEW migration, per the brief's own "prefer a NEW
-- migration". Semantics unchanged from the round-#4 version: a batch that
-- had already had its first recompute must start out holding its
-- inherited demand rather than 0, or its next recompute reads that 0 as "I
-- inherited nothing" and pays out demand it had already withheld.
-- carriedExternalDemandCents is the best available reconstruction —
-- identical to the original for a batch that has not yet absorbed any of
-- it, never an over-statement for one that has. Untouched batches keep 0,
-- which is right for them. Idempotent; a no-op on a fresh deploy.
UPDATE "settlement_batches"
  SET "inheritedExternalDemandCents" = "carriedExternalDemandCents"
  WHERE "shortfallResolvedAt" IS NOT NULL
    AND "inheritedExternalDemandCents" = 0
    AND "carriedExternalDemandCents" > 0;

-- No claim rows can be backfilled from the old representation: it never
-- recorded WHICH predecessor a batch inherited from — that omission is
-- precisely the defect this migration closes. A pre-existing batch with a
-- nonzero inheritedExternalDemandCents and no discoverable source will
-- have it re-derived to 0 on its next recompute, i.e. the demand is
-- released rather than charged: the conservative direction (under-collect,
-- never over-charge a merchant for a claim nobody can justify). No
-- deployment has ever run this engine, so no such row exists.
