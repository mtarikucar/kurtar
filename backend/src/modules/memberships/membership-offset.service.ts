import { Injectable } from "@nestjs/common";
import { MembershipSubscription, Prisma } from "@prisma/client";

export interface MembershipDueForRecompute {
  subscriptionId: string;
  /** Balance available for THIS batch's computeSettlement call — the
   * subscription's current outstandingCents PLUS whatever this SAME batch
   * already contributed on a prior recompute pass (see this class's doc
   * comment for why that addition is what makes a repeated recompute
   * idempotent). 0 for a merchant with no subscription yet (defensive —
   * see the doc comment on the null-return case below). */
  dueCents: number;
  alreadyMarkedPaid: boolean;
  wasTrial: boolean;
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
 * takes the batch's OWN prior contribution
 * (`SettlementBatch.membershipOffsetCents` as it stood before this pass)
 * and ADDS IT BACK to the subscription's stored `outstandingCents` before
 * returning `dueCents` — effectively "undo what this batch took last time,
 * then let computeSettlement decide fresh how much it should take this
 * time." `persistOffset` then re-derives the new `outstandingCents` from
 * that SAME `dueCents` base, so running this pair any number of times for
 * the same batch (with the same underlying lines) always converges to the
 * identical final `outstandingCents`, never double- or under-counting.
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
   * without crashing the whole nightly batch for one merchant). */
  async lockAndResolveDue(
    tx: Prisma.TransactionClient,
    merchantId: string,
    batchPriorOffsetCents: number,
  ): Promise<MembershipDueForRecompute | null> {
    const rows = await tx.$queryRaw<MembershipSubscription[]>(Prisma.sql`
      SELECT * FROM "membership_subscriptions"
      WHERE "merchantId" = ${merchantId}
      FOR UPDATE
    `);
    const sub = rows[0];
    if (!sub) return null;

    return {
      subscriptionId: sub.id,
      dueCents: sub.outstandingCents + batchPriorOffsetCents,
      alreadyMarkedPaid: sub.periodPaidAt != null,
      wasTrial: sub.status === "TRIAL",
    };
  }

  /** Persists the new offset — see the class doc comment for the "undo,
   * then re-derive" idempotency story. `dueCentsBase` MUST be the same
   * `dueCents` `lockAndResolveDue` just returned (the caller passes it
   * straight through); `appliedOffsetCents` is computeSettlement's
   * `membershipOffsetCents` output for this same pass. Flips TRIAL ->
   * ACTIVE the first time a subscription is actually touched by a real
   * batch (brief's "status TRIAL -> ACTIVE": a fresh subscription starts
   * TRIAL and becomes ACTIVE once the merchant has genuine settlement
   * activity, not on a timer). */
  async persistOffset(
    tx: Prisma.TransactionClient,
    due: MembershipDueForRecompute,
    dueCentsBase: number,
    appliedOffsetCents: number,
  ): Promise<void> {
    const newOutstanding = Math.max(0, dueCentsBase - appliedOffsetCents);
    const data: Prisma.MembershipSubscriptionUpdateInput = {
      outstandingCents: newOutstanding,
    };
    if (newOutstanding === 0 && !due.alreadyMarkedPaid) {
      data.periodPaidAt = new Date();
    }
    if (due.wasTrial) {
      data.status = "ACTIVE";
    }
    await tx.membershipSubscription.update({
      where: { id: due.subscriptionId },
      data,
    });
  }
}
