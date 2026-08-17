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

-- [Fix round #5, LOW 3 + round-trip identity] RECONSTRUCT the ledger from
-- the column, not the column from itself.
--
-- Round #4 shipped a backfill that set inheritedExternalDemandCents from
-- carriedExternalDemandCents, because back then that column was the frozen
-- INPUT a later recompute read back. Round #5 removed that read entirely:
-- inheritedExternalDemandCents is now a PROJECTION of this table, and the
-- input comes from the pinned predecessor. That backfill is therefore
-- obsolete, and 20260815120000 has been restored to its original content
-- (an applied migration must never be edited — `prisma migrate deploy`
-- refuses a changed checksum, and ops/release-deploy.yml runs exactly that
-- against a long-lived database).
--
-- What this migration must do instead is make the two representations
-- AGREE on a populated database, in both directions, so that a down->up
-- cycle is identity-preserving rather than manufacturing the very
-- divergence the engine's assertLedgerIdentity forbids
-- (inheritedExternalDemandCents > 0 with an empty claims table). Each of
-- this round's migrations reconstructs its table from the denormalised
-- columns that survive its own down.sql — 20260815160000 rebuilds
-- allocations from settlement_lines.clawbackBatchId/clawbackCents, and
-- this one rebuilds claims from settlement_batches.
--
-- The pinned source is re-derived with the SAME rule the engine's
-- discoverCarriedDemandSource uses: the merchant's most recent OTHER
-- batch. A batch's first pass always immediately follows its creation, so
-- the batch it pinned was necessarily created before it — which is what
-- makes "(createdAt, id) strictly less than mine, ordered descending"
-- an exact reconstruction rather than a guess.
UPDATE "settlement_batches" b
  SET "carriedDemandSourceBatchId" = (
    SELECT p."id"
    FROM "settlement_batches" p
    WHERE p."merchantId" = b."merchantId"
      AND (p."createdAt", p."id") < (b."createdAt", b."id")
    ORDER BY p."createdAt" DESC, p."id" DESC
    LIMIT 1
  )
  WHERE b."inheritedExternalDemandCents" > 0
    AND b."carriedDemandSourceBatchId" IS NULL;

INSERT INTO "settlement_carried_demand_claims" ("claimantBatchId", "sourceBatchId", "amountCents")
SELECT b."id", b."carriedDemandSourceBatchId", b."inheritedExternalDemandCents"
FROM "settlement_batches" b
WHERE b."inheritedExternalDemandCents" > 0
  AND b."carriedDemandSourceBatchId" IS NOT NULL
ON CONFLICT ("claimantBatchId") DO NOTHING;

-- Tripwire. Invariant 1 (inheritedExternalDemandCents === its claim's
-- amount, 0 when there is none) must hold the instant this migration
-- finishes, on any database it is applied to. A batch with a nonzero
-- inherited amount and no reconstructable predecessor is impossible — the
-- amount can only have come FROM a predecessor — so this can never fire;
-- but a migration that could silently leave the ledger diverged is exactly
-- what this round was raised against, so it fails loudly instead of
-- hoping. Both statements above are idempotent, and this whole block is a
-- no-op on a fresh database.
DO $$
DECLARE diverged INTEGER;
BEGIN
  SELECT count(*) INTO diverged
  FROM "settlement_batches" b
  WHERE b."inheritedExternalDemandCents" <> COALESCE(
    (SELECT c."amountCents" FROM "settlement_carried_demand_claims" c
      WHERE c."claimantBatchId" = b."id"), 0);
  IF diverged > 0 THEN
    RAISE EXCEPTION 'settlement_carried_demand_claims backfill left % batch(es) whose inheritedExternalDemandCents does not match their claim row', diverged;
  END IF;
END $$;
