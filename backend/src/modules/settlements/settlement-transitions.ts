import { SettlementStatus } from "@prisma/client";

/**
 * The complete SettlementBatch state machine — mirrors
 * reservations/reservation-transitions.ts exactly (the map IS the
 * enforcement, deriving the guarded-WHERE "from" lists every write site
 * uses, rather than four call sites hand-typing their own status lists
 * that can silently drift apart — which is exactly how C2/C3 happened:
 * adminApprove, adminHold, adminRetry, and markSent each wrote their own
 * ad-hoc `{in: [...]}` guard, and none of them agreed on what "APPROVED"
 * was allowed to become).
 *
 * PENDING -> CALCULATED is declared but has no current writer (every
 * batch is created directly as CALCULATED — settlement-batch-builder.
 * service.ts) — kept for the same reason reservation-transitions.ts
 * declares known-but-unused future edges: PENDING is a real enum value,
 * and a future "batch created but not yet computed" step should not have
 * to touch this file.
 *
 * SENT -> SETTLED / FAILED are likewise declared with no current writer —
 * there is no automated bank/PSP reconciliation feed in this task (see
 * settlement-payout.service.ts's reconcileStuckBatches doc comment); a
 * future task's manual "mark settled" action reuses this edge rather than
 * inventing its own.
 */
export const SETTLEMENT_TRANSITIONS: Record<
  SettlementStatus,
  readonly SettlementStatus[]
> = {
  PENDING: ["CALCULATED"],
  CALCULATED: ["APPROVED", "HELD"],
  // [Fix round, C3] APPROVED -> HELD is only ever valid before a payout
  // has been attempted — settlements.service.ts's adminHold ALSO checks
  // `payoutAttemptedAt IS NULL` in its guarded UPDATE, a constraint this
  // status-only map cannot express (mirrors how reservation-transitions.ts
  // is a necessary but not sufficient condition for some of ITS
  // callers' extra guards, e.g. cancelDeadlineAt checks in
  // reservations.service.ts).
  APPROVED: ["SENT", "HELD"],
  // [Fix round, C2] HELD -> CALCULATED is a recompute resolving the
  // batch's shortfall back to 0 (settlement-batch-builder.service.ts's
  // recomputeBatch) — a SEPARATE, later adminApprove() call is what then
  // moves CALCULATED -> APPROVED; recompute itself never jumps straight
  // to APPROVED.
  HELD: ["CALCULATED"],
  SENT: ["SETTLED", "FAILED"],
  SETTLED: [],
  FAILED: [],
};

export function isSettlementTransitionAllowed(
  from: SettlementStatus,
  to: SettlementStatus,
): boolean {
  return SETTLEMENT_TRANSITIONS[from].includes(to);
}

/** The inverse of SETTLEMENT_TRANSITIONS: every status allowed to
 * transition INTO `to` — what a guarded UPDATE's WHERE clause actually
 * needs. settlements.service.ts / settlement-payout.service.ts derive
 * their compound-WHERE status lists from this rather than hand-typing
 * them a second time. */
export function allowedFromStatusesFor(
  to: SettlementStatus,
): SettlementStatus[] {
  return (Object.keys(SETTLEMENT_TRANSITIONS) as SettlementStatus[]).filter(
    (from) => SETTLEMENT_TRANSITIONS[from].includes(to),
  );
}

/** Statuses `SettlementBatchBuilderService.recomputeBatch` will ever
 * write to / read from as "still mutable" — everything else is frozen
 * history. Exported so the frozen-check in recomputeBatch derives from
 * this single source rather than hand-typing `!== "CALCULATED" && !==
 * "HELD"` a second time. */
export const RECOMPUTABLE_SETTLEMENT_STATUSES: readonly SettlementStatus[] = [
  "CALCULATED",
  "HELD",
];
