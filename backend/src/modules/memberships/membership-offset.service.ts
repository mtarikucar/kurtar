import { Injectable } from "@nestjs/common";
import { MembershipSubscription, Prisma } from "@prisma/client";
import { roundKurus } from "../settlements/settlement-math";

export interface MembershipDueForRecompute {
  subscriptionId: string;
  /** Balance available for THIS batch's computeSettlement call (net + VAT
   * combined) — the subscription's current outstandingCents PLUS whatever
   * this SAME batch already contributed on a prior recompute pass. 0 for a
   * merchant with no subscription yet, or one still inside its
   * membershipExemptUntil window as of THIS batch's period date (see
   * lockAndResolveDue's doc comment — [Fix round, I6]). */
  dueCents: number;
  /** The VAT-only portion of `dueCents` — [Fix round, P2]. Needed to
   * allocate a partial offset proportionally between net and VAT (see
   * `splitMembershipOffsetVat`). */
  dueVatCents: number;
  alreadyMarkedPaid: boolean;
  /** [Fix round, P1] TRIAL or PAST_DUE — either should flip to ACTIVE the
   * first time a real batch actually offsets something against this
   * period (see persistOffset). PAST_DUE is what a renewal rollover sets
   * when the just-ended period was forgiven with an outstanding balance
   * (membership-renewal-cron.service.ts) — this is the "self-heals on
   * real earnings" half of that story. */
  needsActivation: boolean;
  /** [Fix round, I6 — second-order fix] True when this period's date falls
   * inside the merchant's (possibly since-granted) exemption window.
   * `dueCents`/`dueVatCents` are 0 in this case, but that 0 is an
   * ARTIFACT of "nothing is being collected right now" — it is NOT the
   * subscription's true balance. The caller (recomputeBatch) MUST skip
   * persistOffset entirely when this is true: persistOffset's formula
   * takes `dueCentsBase` as the baseline it writes back as the new
   * `outstandingCents`, and feeding it the artificial 0 would overwrite
   * a real, still-owed balance with 0 — silently erasing debt that is
   * merely PAUSED, not forgiven (a real bug caught by
   * memberships.realdb.spec.ts's retroactive-exemption test: the first
   * version of this fix did exactly that). */
  exempt: boolean;
}

/**
 * The membership offset engine settlements.service.ts calls from INSIDE
 * its own locked transaction — not a REST-facing service (that's
 * memberships.service.ts).
 *
 * IDEMPOTENT RECOMPUTE: a SettlementBatch may be recomputed more than once
 * before it's ever SENT (the nightly cron "extends" a still-CALCULATED
 * batch with newly-redeemed lines; `approve()` recomputes once more before
 * locking it in). Each recompute calls computeSettlement() fresh over ALL
 * of the batch's current lines — never an incremental delta — and the
 * membership offset must be exactly as idempotent: `lockAndResolveDue`
 * takes the batch's OWN prior contribution (both the combined total,
 * `SettlementBatch.membershipOffsetCents`, AND its VAT portion,
 * `membershipOffsetVatCents`, as they stood before this pass) and ADDS
 * THEM BACK to the subscription's stored outstanding balances before
 * returning `dueCents`/`dueVatCents` — effectively "undo what this batch
 * took last time, then let computeSettlement decide fresh how much it
 * should take this time." `persistOffset` then re-derives the new
 * outstanding balances from that SAME base, so running this pair any
 * number of times for the same batch always converges to the identical
 * final result, never double- or under-counting.
 *
 * ROW LOCK: `lockAndResolveDue` takes `FOR UPDATE` on the subscription row
 * so two batches for the SAME merchant being computed concurrently (a
 * fresh today's batch and, say, a very-late clawback-only batch, processed
 * by two overlapping cron ticks) serialize on the ONE membership balance
 * they share, rather than racing a read-then-write on it.
 */
@Injectable()
export class MembershipOffsetService {
  /** `merchantId` has at most one subscription (unique constraint) —
   * returns null if none exists yet (defensive: shouldn't happen for an
   * APPROVED merchant by the time they have a redeemed+paid reservation,
   * since offer claiming itself requires APPROVED and the subscription is
   * created in the same approval's outbox fan-out — but the outbox is
   * eventually-consistent, so a caller must handle "not yet created"
   * without crashing the whole nightly batch for one merchant).
   *
   * [Fix round, I6] `membershipExemptUntil` is re-checked HERE, as-of
   * `periodDate` (the batch's own period, not "now" and not "whenever the
   * subscription was created") — not just once at subscription-creation
   * time (memberships.service.ts's createForApprovedMerchant). This is
   * what makes granting founding status AFTER a merchant is already
   * approved (a real go-to-market action — "first 100 founding members")
   * actually take effect: any settlement period whose date falls before
   * the (possibly since-updated) exemption cutoff returns dueCents=0,
   * PAUSING collection for that period regardless of what the
   * subscription's stored outstanding balance currently holds — it is not
   * forgiven, just not collected while the window is open; collection
   * resumes automatically the moment a period's date passes the cutoff.
   */
  async lockAndResolveDue(
    tx: Prisma.TransactionClient,
    merchantId: string,
    batchPriorOffsetCents: number,
    batchPriorOffsetVatCents: number,
    periodDate: Date,
    membershipExemptUntil: Date | null,
  ): Promise<MembershipDueForRecompute | null> {
    const rows = await tx.$queryRaw<MembershipSubscription[]>(Prisma.sql`
      SELECT * FROM "membership_subscriptions"
      WHERE "merchantId" = ${merchantId}
      FOR UPDATE
    `);
    const sub = rows[0];
    if (!sub) return null;

    const exempt =
      membershipExemptUntil != null &&
      periodDate.getTime() < membershipExemptUntil.getTime();

    return {
      subscriptionId: sub.id,
      dueCents: exempt ? 0 : sub.outstandingCents + batchPriorOffsetCents,
      dueVatCents: exempt
        ? 0
        : sub.outstandingVatCents + batchPriorOffsetVatCents,
      alreadyMarkedPaid: sub.periodPaidAt != null,
      needsActivation: sub.status === "TRIAL" || sub.status === "PAST_DUE",
      exempt,
    };
  }

  /** Persists the new offset — see the class doc comment for the "undo,
   * then re-derive" idempotency story. `dueCentsBase`/`dueVatCentsBase`
   * MUST be the same values `lockAndResolveDue` just returned (the caller
   * passes them straight through); `appliedOffsetCents` is
   * computeSettlement's `membershipOffsetCents` output for this same pass.
   * Returns the VAT portion of `appliedOffsetCents` so the caller can
   * write it onto SettlementBatch.membershipOffsetVatCents (the same
   * split this method itself persists onto the subscription). Flips
   * TRIAL/PAST_DUE -> ACTIVE the first time a subscription is actually
   * touched by a real batch.
   *
   * [Fix round, I6 — second-order fix] No-ops entirely — writes nothing —
   * when `due.exempt` is true. `dueCentsBase` is an ARTIFICIAL 0 in that
   * case (lockAndResolveDue's exemption branch), not the subscription's
   * real balance; without this guard the formula below would compute
   * `max(0, 0 - 0) = 0` and overwrite a genuinely still-owed balance with
   * 0, silently erasing debt that is only meant to be PAUSED while the
   * exemption window is open. This guard lives here (not just in the
   * caller) so every call path is protected, not only the ones that
   * remember to check `due.exempt` themselves first. */
  async persistOffset(
    tx: Prisma.TransactionClient,
    due: MembershipDueForRecompute,
    dueCentsBase: number,
    dueVatCentsBase: number,
    appliedOffsetCents: number,
  ): Promise<{ appliedOffsetVatCents: number }> {
    if (due.exempt) {
      return { appliedOffsetVatCents: 0 };
    }
    const appliedOffsetVatCents = splitMembershipOffsetVat(
      dueCentsBase,
      dueVatCentsBase,
      appliedOffsetCents,
    );
    const newOutstanding = Math.max(0, dueCentsBase - appliedOffsetCents);
    const newOutstandingVat = Math.max(
      0,
      dueVatCentsBase - appliedOffsetVatCents,
    );
    const data: Prisma.MembershipSubscriptionUpdateInput = {
      outstandingCents: newOutstanding,
      outstandingVatCents: newOutstandingVat,
    };
    if (newOutstanding === 0 && !due.alreadyMarkedPaid) {
      data.periodPaidAt = new Date();
    }
    if (due.needsActivation) {
      data.status = "ACTIVE";
    }
    await tx.membershipSubscription.update({
      where: { id: due.subscriptionId },
      data,
    });
    return { appliedOffsetVatCents };
  }
}

/**
 * [Fix round, P2] Allocates how much of `appliedOffsetCents` (a batch's
 * total membership offset, net+VAT combined) is the VAT portion, given the
 * remaining balance's own net/VAT split (`dueCentsBase`/`dueVatCentsBase`).
 * Exported standalone (not a class method) for direct unit testing.
 *
 * Two cases:
 *  - The offset fully clears what remains (`appliedOffsetCents >=
 *    dueCentsBase`): the VAT portion is exactly whatever VAT remained —
 *    nothing to allocate proportionally, the whole balance (net and VAT)
 *    is gone.
 *  - A PARTIAL offset: allocated proportionally to the remaining net:VAT
 *    ratio (the reviewer's own example — "offset 6000 to recover
 *    5000+1000" is the boundary case above; a partial offset of, say,
 *    3000 against that same 5000+1000 balance recovers 2500 net + 500 VAT,
 *    preserving the 5:1 ratio), rounded via the single-sourced
 *    `roundKurus`, clamped so it can never exceed either the remaining VAT
 *    or the applied total itself (defends against a rounding edge pushing
 *    the proportional share a kuruş over either bound).
 */
export function splitMembershipOffsetVat(
  dueCentsBase: number,
  dueVatCentsBase: number,
  appliedOffsetCents: number,
): number {
  if (appliedOffsetCents <= 0 || dueCentsBase <= 0) return 0;
  if (appliedOffsetCents >= dueCentsBase) return dueVatCentsBase;
  const proportional = roundKurus(
    (appliedOffsetCents * dueVatCentsBase) / dueCentsBase,
  );
  return Math.min(proportional, dueVatCentsBase, appliedOffsetCents);
}
