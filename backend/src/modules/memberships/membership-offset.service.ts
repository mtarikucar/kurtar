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
  /** [Fix round #2, I6 — second-order fix, corrected] True when this
   * period's date falls inside the merchant's (possibly since-granted)
   * exemption window. `dueCents`/`dueVatCents` are `batchPriorOffsetCents`/
   * `batchPriorOffsetVatCents` in this case — this batch's OWN
   * already-committed contribution, RESTORED unchanged, not zeroed — so
   * computeSettlement reproduces the SAME batch-level offset it already
   * had rather than resetting it. `persistOffset` still writes NOTHING to
   * the subscription while this is true (see its own doc comment): the
   * subscription's TRUE outstandingCents already correctly reflects
   * whatever this batch collected during an EARLIER, non-exempt pass, and
   * must not be touched again just because exemption was granted later.
   *
   * [Fix round #2 — this flag's FIRST version caused a NEW double-loss,
   * caught by the re-review, not self-caught] Feeding the exempt branch a
   * hard 0 (rather than the batch's own prior contribution) was correct
   * for the subscription side but wrong for the BATCH side:
   * recomputeBatch still writes membershipOffsetCents/VatCents onto the
   * batch from computeSettlement's result, which was fed that artificial
   * 0 as membershipDueCents. Sequence: batch computed with a real offset
   * of 5000 (subscription outstanding 6000 -> 1000); founding status
   * granted retroactively covering this batch's period (the exact GTM
   * action I6 exists for); a LATER recompute (extend/retry/approve) sees
   * exempt=true, feeds membershipDueCents=0, and OVERWRITES the batch's
   * own membershipOffsetCents from 5000 down to 0 — paying the merchant
   * 5000 MORE than before, while the subscription still shows only 1000
   * owed (unchanged) — the same 5000 benefits the merchant twice.
   * Restoring batchPriorOffsetCents here closes this: computeSettlement
   * re-derives the SAME 5000 every pass regardless of exemption, capped
   * at exactly what was already committed — never MORE (newly-arriving
   * gross while exempt can't grow the offset) and never LESS (a later
   * pass can't silently drop it either). */
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
      // [Fix round #2, I6] Exempt: RESTORE this batch's own prior
      // contribution (not 0) — see the interface doc comment above for
      // the double-loss bug this closes.
      dueCents: exempt
        ? batchPriorOffsetCents
        : sub.outstandingCents + batchPriorOffsetCents,
      dueVatCents: exempt
        ? batchPriorOffsetVatCents
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
   * [Fix round #2, I6 — second-order fix, corrected] Writes NOTHING to
   * the subscription when `due.exempt` is true — `dueCentsBase` here is
   * ONLY this batch's own restored prior contribution (see
   * lockAndResolveDue), not the subscription's true full balance, so the
   * normal `dueCentsBase - appliedOffsetCents` formula is not a valid
   * basis for a subscription-side write while exempt (it would only ever
   * see this batch's own slice, never whatever else the subscription may
   * separately still owe).
   *
   * [Fix round #3, I6-residual] The VAT returned while exempt is now
   * `splitMembershipOffsetVat(dueCentsBase, dueVatCentsBase,
   * appliedOffsetCents)` — the SAME proportional-split helper the
   * non-exempt path already uses — not a hardcoded `dueVatCentsBase`.
   * The prior version assumed `appliedOffsetCents` always equals
   * `dueCentsBase` while exempt (a full clear, restoring exactly what was
   * already committed), which is the common case but not the only
   * reachable one: if this batch's OWN available amount SHRANK since its
   * last pass (a bagFeeCentsOverride edit, a shrinking gross), the
   * restored `membershipDueCents` gets CLAMPED by computeSettlement to
   * whatever's actually available — `appliedOffsetCents < dueCentsBase`.
   * Returning the FULL `dueVatCentsBase` regardless would hand back a VAT
   * portion larger than its true proportional share of the CLAMPED
   * amount, and potentially larger than the clamped net amount itself,
   * corrupting `batch.membershipOffsetVatCents` and the membership
   * invoice line it feeds — with the shortfall neither restored to
   * `outstandingCents` (exempt means no subscription-side write at all)
   * nor carried anywhere else. `splitMembershipOffsetVat` already handles
   * both cases correctly (full clear returns `dueVatCentsBase` in full —
   * identical to the old behavior in the common case; a partial applies
   * the same proportional net:VAT split the non-exempt path relies on),
   * so this is a strict correctness improvement with no change to the
   * unclamped/common-case output. This guard lives here (not just in the
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
      return {
        appliedOffsetVatCents: splitMembershipOffsetVat(
          dueCentsBase,
          dueVatCentsBase,
          appliedOffsetCents,
        ),
      };
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
