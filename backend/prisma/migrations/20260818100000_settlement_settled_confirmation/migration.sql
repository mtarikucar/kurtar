-- [Cross-lane fix, M3] Record that a payout actually ARRIVED.
--
-- `sentAt` only ever meant "the transfer was handed to the PSP". Nothing
-- in this system recorded that the money landed in the merchant's
-- account: SETTLED has been a declared edge in settlement-transitions.ts
-- (SENT -> ['SETTLED','FAILED']) since the state machine was written and
-- had no writer at all, so every SENT batch stayed SENT forever and the
-- daily reconciliation sweep's stale-SENT branch alerted on a state
-- nothing could clear.
--
-- The writer is now POST /api/admin/settlements/{id}/settle: an admin who
-- has reconciled the batch against the bank/PSP statement closes it, and
-- the guarded UPDATE + its AuditLog row commit together.
--
--   "settledAt"           — when the admin confirmed the transfer landed.
--   "settlementReference" — the statement reference reconciled against
--                           (dekont/EFT/statement line). Free text: no
--                           provider feed produces it.
--
-- Both NULLABLE with no DEFAULT — safe on a non-empty table, and NULL
-- already means exactly "not confirmed" for every existing row.
ALTER TABLE "settlement_batches"
  ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "settlementReference" TEXT;
