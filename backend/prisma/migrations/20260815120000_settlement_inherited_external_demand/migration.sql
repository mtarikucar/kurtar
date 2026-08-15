-- [Fix round #3, C2-residual] The immutable original amount a settlement
-- batch inherited from a predecessor on its first-ever recompute pass —
-- distinct from settlement_batches.carriedExternalDemandCents (the mutable
-- residual). See schema.prisma's doc comment on this column for the full
-- story: without it, a batch's own routine recompute (adminApprove/
-- adminRetry) forgot its own already-absorbed inherited demand and
-- forgave it on the very next pass.
ALTER TABLE "settlement_batches"
  ADD COLUMN "inheritedExternalDemandCents" INTEGER NOT NULL DEFAULT 0;
