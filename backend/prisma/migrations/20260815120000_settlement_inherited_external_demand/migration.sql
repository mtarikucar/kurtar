-- [Fix round #3, C2-residual] The immutable original amount a settlement
-- batch inherited from a predecessor on its first-ever recompute pass —
-- distinct from settlement_batches.carriedExternalDemandCents (the mutable
-- residual). See schema.prisma's doc comment on this column for the full
-- story: without it, a batch's own routine recompute (adminApprove/
-- adminRetry) forgot its own already-absorbed inherited demand and
-- forgave it on the very next pass.
ALTER TABLE "settlement_batches"
  ADD COLUMN "inheritedExternalDemandCents" INTEGER NOT NULL DEFAULT 0;

-- [Fix round #4] Backfill — without it this migration re-creates, on
-- pre-existing rows, the exact Critical it was written to close. A batch
-- that had already had its first recompute (shortfallResolvedAt IS NOT
-- NULL) must start out holding its inherited demand, not 0: otherwise its
-- very next recompute reads that 0 as "I inherited nothing" and pays out
-- demand it had already, correctly, withheld. carriedExternalDemandCents
-- is the best available reconstruction — identical to the original for a
-- batch that has not yet absorbed any of it, and never an over-statement
-- for one that has. A batch that has never been recomputed keeps the
-- DEFAULT 0, which is exactly right for it: nothing inherited yet. No
-- production data exists anywhere this migration runs, so the practical
-- impact is nil; the migration must still be semantically correct on its
-- own. Idempotent — re-running writes the same values.
UPDATE "settlement_batches"
  SET "inheritedExternalDemandCents" = "carriedExternalDemandCents"
  WHERE "shortfallResolvedAt" IS NOT NULL;
