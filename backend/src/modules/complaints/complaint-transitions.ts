import { ComplaintStatus } from "@prisma/client";

/**
 * The complete ComplaintTicket state machine — mirrors
 * reservations/reservation-transitions.ts and
 * settlements/settlement-transitions.ts exactly (the map IS the
 * enforcement; every guarded UPDATE's WHERE clause derives its "from"
 * list from allowedFromStatusesFor below, never a hand-typed duplicate).
 *
 * OPEN -> MERCHANT_RESPONDED: a MERCHANT's first reply
 * (complaints.service.ts's addMessage).
 * {OPEN, MERCHANT_RESPONDED} -> RESOLVED: admin resolve, or a merchant
 * re-replying to an already-MERCHANT_RESPONDED ticket doesn't re-trigger
 * this — it's a status-changing endpoint action, not a message side
 * effect on that edge.
 * {OPEN, MERCHANT_RESPONDED} -> ESCALATED: admin manual escalate, OR the
 * SLA cron's automatic breach escalation (complaint-sla-cron.service.ts)
 * — same target status, same guard, different actor.
 * ESCALATED -> RESOLVED: an admin can still resolve a complaint after it
 * escalated (escalation is not a dead end — it raises visibility, it
 * doesn't forbid closing the ticket).
 * RESOLVED is terminal.
 */
export const COMPLAINT_TRANSITIONS: Record<
  ComplaintStatus,
  readonly ComplaintStatus[]
> = {
  OPEN: ["MERCHANT_RESPONDED", "RESOLVED", "ESCALATED"],
  MERCHANT_RESPONDED: ["RESOLVED", "ESCALATED"],
  ESCALATED: ["RESOLVED"],
  RESOLVED: [],
};

export function isComplaintTransitionAllowed(
  from: ComplaintStatus,
  to: ComplaintStatus,
): boolean {
  return COMPLAINT_TRANSITIONS[from].includes(to);
}

/** The inverse of COMPLAINT_TRANSITIONS — exactly what a guarded
 * UPDATE's WHERE clause needs. complaints.service.ts /
 * complaint-sla-cron.service.ts derive every compound-WHERE status list
 * from this rather than hand-typing it a second time. */
export function allowedFromStatusesFor(to: ComplaintStatus): ComplaintStatus[] {
  return (Object.keys(COMPLAINT_TRANSITIONS) as ComplaintStatus[]).filter(
    (from) => COMPLAINT_TRANSITIONS[from].includes(to),
  );
}
