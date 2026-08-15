-- [Fix round #4] The per-(batch, line) refund-clawback ledger.
--
-- Before this table, "how much of line L's clawback demand did batch B
-- withhold?" was INFERRED from SettlementLine.clawbackBatchId (a single
-- mutable owner pointer) plus its cumulative clawbackCents. Inference has
-- no inverse: once a second batch touched the line, B's own contribution
-- was unrecoverable, so B's next recompute could neither undo nor
-- reproduce it. Four consecutive audits found four instances of exactly
-- that failure, each one column over from the last. Recording the
-- attribution instead of inferring it makes the whole class unreachable —
-- see schema.prisma's doc comment on SettlementClawbackAllocation and
-- settlement-batch-builder.service.ts's class doc comment.
--
-- CASCADE on both FKs is deliberate and matches this table's nature: an
-- allocation is a derived child that has no meaning without either parent,
-- and (unlike the money rows the repo's Restrict convention protects) it
-- is fully re-derivable — every recompute rebuilds its own rows from
-- scratch.
CREATE TABLE "settlement_clawback_allocations" (
    "batchId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_clawback_allocations_pkey" PRIMARY KEY ("batchId","reservationId")
);

-- CreateIndex
CREATE INDEX "settlement_clawback_allocations_reservationId_idx" ON "settlement_clawback_allocations"("reservationId");

-- AddForeignKey
ALTER TABLE "settlement_clawback_allocations" ADD CONSTRAINT "settlement_clawback_allocations_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_clawback_allocations" ADD CONSTRAINT "settlement_clawback_allocations_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "settlement_lines"("reservationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: reconstruct the attribution that used to live in the owner
-- pointer, so an already-populated database keeps every kuruş it had
-- already recorded as withheld instead of silently re-opening it. This is
-- the best reconstruction the old representation supports (it only ever
-- remembered the LAST toucher — that limitation is precisely the defect
-- this table removes). Idempotent: ON CONFLICT DO NOTHING, and this
-- table is empty on a fresh deploy, so the statement is a no-op there.
INSERT INTO "settlement_clawback_allocations" ("batchId", "reservationId", "amountCents")
SELECT sl."clawbackBatchId", sl."reservationId", sl."clawbackCents"
FROM "settlement_lines" sl
WHERE sl."clawbackBatchId" IS NOT NULL
  AND sl."clawbackCents" > 0
ON CONFLICT ("batchId", "reservationId") DO NOTHING;
