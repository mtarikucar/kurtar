import { MerchantVerificationStatus } from "@prisma/client";

/**
 * The complete Merchant.verificationStatus state machine — same pattern as
 * reservations/reservation-transitions.ts (Task 4's I4 finding: the map
 * must BE the enforcement, not documentation next to hand-typed
 * duplicates). Every status maps to the exact set of statuses it may
 * transition to; anything not listed is denied.
 *
 * Endpoints this task wires up: DRAFT -> SUBMITTED (POST /merchants/me/submit),
 * {SUBMITTED,UNDER_REVIEW} -> APPROVED (POST /admin/merchants/:id/approve),
 * {SUBMITTED,UNDER_REVIEW} -> REJECTED (POST /admin/merchants/:id/reject),
 * APPROVED -> SUSPENDED (POST /admin/merchants/:id/suspend, the kill switch —
 * only a previously-APPROVED merchant can have live stores/offers to kill,
 * since store creation itself requires APPROVED).
 *
 * SUBMITTED -> UNDER_REVIEW has no endpoint yet (no "start review" action in
 * this task's brief) but is declared here anyway, matching
 * reservation-transitions.ts's own precedent for CANCELLED_BY_MERCHANT/
 * NO_SHOW — a valid schema edge, just not one anything writes to today.
 * REJECTED and SUSPENDED are both terminal for this task: no
 * resubmit/reinstate endpoint exists yet.
 */
export const MERCHANT_VERIFICATION_TRANSITIONS: Record<
  MerchantVerificationStatus,
  readonly MerchantVerificationStatus[]
> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["SUSPENDED"],
  REJECTED: [],
  SUSPENDED: [],
};

export function isMerchantVerificationTransitionAllowed(
  from: MerchantVerificationStatus,
  to: MerchantVerificationStatus,
): boolean {
  return MERCHANT_VERIFICATION_TRANSITIONS[from].includes(to);
}

/**
 * The inverse of MERCHANT_VERIFICATION_TRANSITIONS: every status allowed
 * to transition INTO `to` — exactly what a guarded UPDATE's WHERE clause
 * needs. merchants.service.ts derives every compound-WHERE status list
 * from this function rather than hand-typing it a second time.
 */
export function allowedFromStatusesFor(
  to: MerchantVerificationStatus,
): MerchantVerificationStatus[] {
  return (
    Object.keys(
      MERCHANT_VERIFICATION_TRANSITIONS,
    ) as MerchantVerificationStatus[]
  ).filter((from) => MERCHANT_VERIFICATION_TRANSITIONS[from].includes(to));
}
