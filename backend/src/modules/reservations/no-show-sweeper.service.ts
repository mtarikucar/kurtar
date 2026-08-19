import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { allowedFromStatusesFor } from "./reservation-transitions";

/**
 * How long after a pickup window closes a still-CONFIRMED reservation is
 * declared NO_SHOW.
 *
 * WHY ONE HOUR — the bound is squeezed from both sides, and the upper
 * bound is the money-critical one:
 *
 *  - UPPER BOUND (must not be longer). A no-show settles into the batch
 *    for the Istanbul day its pickup window closed on — the SAME batch as
 *    the bags that WERE collected from that window (see
 *    settlement-batch-builder.service.ts's `settlementAnchorOf`). That
 *    batch is built by the nightly cron at 02:00 Europe/Istanbul, and
 *    offer-window.rules.ts forces a pickup window to end on its own
 *    offerDate in Istanbul local time — so the latest a window can close
 *    is 23:59:59 Istanbul, leaving just over two hours before its batch is
 *    built. A no-show written AFTER that batch has been approved/sent is
 *    refused by `recomputeBatch` ("NOT attaching newly-computed line(s)"),
 *    the reservation keeps `settlementLine: null` for ever, and the
 *    merchant is never paid — which is precisely the hole this sweeper
 *    exists to close, re-opened one layer down. One hour of grace plus
 *    this cron's 10-minute tick puts the worst case at 01:10 Istanbul,
 *    ~50 minutes clear of the nightly run.
 *
 *  - LOWER BOUND (must not be shorter). `ReservationsService.redeem()`
 *    already refuses outright once `now > offer.pickupEndAt`, so no
 *    legitimate redemption can land after the window closes and zero
 *    grace would technically suffice. The hour is margin against the
 *    things that are not instantaneous: a redeem transaction still in
 *    flight when the window ticked over, clock skew between API replicas,
 *    and the counter-side reconciliation of an offline swipe (plan §4.6)
 *    that staff perform from the merchant panel. If the sweeper ever did
 *    win that race, the guarded update below (not a bare `update`) means
 *    the collected bag wins, never this cron.
 *
 * And the grace costs the merchant NOTHING in payout timing: `dueAt` is
 * derived from the batch's period day, which comes from the pickup
 * window's close — not from the moment this sweep happens to run — so the
 * ≤5-business-day obligation clock is identical for a no-show and for its
 * redeemed siblings no matter when this cron fires.
 */
const NO_SHOW_GRACE_MS = 60 * 60 * 1000; // 1h

/** Bounded batch per tick — a backlog (a deploy gap, a night of downtime)
 * drains over several ticks rather than one tick loading an unbounded
 * result set, matching PickupReminderCronService's own bound. */
const NO_SHOW_BATCH_LIMIT = 500;

/** The transitions table's own answer to "which statuses may become
 * NO_SHOW" — derived, never hand-typed, so the pre-filter and the guarded
 * write can never disagree with reservation-transitions.ts (ADR-0005).
 * Today that is exactly ["CONFIRMED"]; a future edge added to the table
 * propagates here for free. */
const NO_SHOW_FROM = allowedFromStatusesFor("NO_SHOW");

/**
 * Closes the window on a bag nobody came for.
 *
 * A customer reserves and PAYS, then does not turn up. Before this
 * service, nothing in the codebase ever wrote `NO_SHOW`: the reservation
 * sat at CONFIRMED for ever, the consumer app kept it in AKTİF under a
 * countdown frozen at "SON 0 DK", and — the actual defect — the
 * settlement eligibility scan only ever saw `REDEEMED`, so the merchant
 * was NEVER PAID for a bag the customer had already paid for. The money
 * was collected by the platform and settled to nobody.
 *
 * The product rule this implements (plan §4.3 and §4.6): **a no-show is
 * not refunded and counts as a normal sale** — Too Good To Go parity, and
 * the thing that makes the offline-redeem tolerance financially safe. So
 * this sweep does exactly ONE thing: move the reservation to its terminal
 * NO_SHOW status. It deliberately does NOT:
 *
 *   - refund anything (there is no refund path out of NO_SHOW at all, by
 *     construction — NO_SHOW is terminal in RESERVATION_TRANSITIONS, and
 *     `refundRedeemed` requires REDEEMED);
 *   - increment `DailyOffer.qtyRedeemed` — that counter means "bags that
 *     actually went out of the door", which is what the merchant's own
 *     hand-off count and sell-through read; a no-show is a sale, not a
 *     hand-off, and the plan's own KPI table tracks the two separately;
 *   - publish `reservation.redeemed.v1` (the +2h rating invitation) —
 *     inviting somebody to rate a bag they never collected would be a new
 *     defect, and the ratings service's own REDEEMED gate refuses it
 *     anyway;
 *   - publish `reservation.redeemed.impact.v1` — the impact ledger counts
 *     food actually rescued. An uncollected bag was not rescued, so
 *     crediting meals/CO₂e for it would inflate the platform's headline
 *     impact number with waste.
 *
 * The money consequence is not here: it is in
 * settlement-batch-builder.service.ts, whose eligibility scan now accepts
 * a NO_SHOW with a PAID payment on exactly the same terms as a REDEEMED
 * one — same gross, same per-bag platform fee, same %1 withholding.
 *
 * CONCURRENCY. Same shape as PickupReminderCronService and
 * PaymentsSweeperService: a cheap bounded SELECT of candidates, then a
 * per-row guarded `updateMany` whose WHERE re-asserts the status
 * (`NO_SHOW_FROM`, derived from the transitions table) inside the write
 * itself. Two overlapping ticks, or two replicas, racing the same
 * reservation resolve to exactly one winner — the loser's update matches
 * zero rows. The same guard is what makes a redeem landing inside the
 * grace period win: `redeem()`'s own guarded update requires the row to
 * still be CONFIRMED, so whichever of the two commits first excludes the
 * other, and a bag that was genuinely collected is never taken by this
 * cron. Idempotent by construction — NO_SHOW is terminal, so a second
 * sweep simply does not select the row.
 *
 * NO NEW INDEX, DELIBERATELY. `daily_offers` has no index on
 * `pickupEndAt` alone (only the composite `(status, pickupEndAt)`, whose
 * leading column this query does not constrain), so the join half of the
 * candidate scan is unindexed. It is left that way because this sweep is
 * exactly what BOUNDS its own driving set: `reservations` already has
 * `@@index([status, cancelDeadlineAt])`, whose leading column serves
 * `status = 'CONFIRMED'`, and once this cron is running the CONFIRMED
 * population is only "bags whose window has not closed for an hour yet" —
 * roughly one day of live sales platform-wide, not an ever-growing pile of
 * abandoned rows. The offers are then reached by primary key. The one
 * genuinely large pass is the FIRST run after deploy, which has the whole
 * historical backlog to work through, and `NO_SHOW_BATCH_LIMIT` already
 * bounds how much of that any single tick takes on. Add the index if a
 * real query plan ever says otherwise — not on this reasoning's say-so.
 */
@Injectable()
export class NoShowSweeperService {
  private readonly logger = new Logger(NoShowSweeperService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES, {
    name: "reservation-no-show-sweep",
  })
  async sweep(): Promise<void> {
    const { markedNoShow } = await this.sweepOnce();
    if (markedNoShow > 0) {
      this.logger.log(
        `No-show sweep: marked ${markedNoShow} uncollected reservation(s) NO_SHOW`,
      );
    }
  }

  /** Not private — realdb specs call this directly with an explicit `now`
   * (and, where a scenario needs it, an explicit grace) instead of waiting
   * on the cron schedule or sleeping on real time, the same way
   * PickupReminderCronService.sweepOnce is reached. */
  async sweepOnce(
    now: Date = new Date(),
    graceMs: number = NO_SHOW_GRACE_MS,
  ): Promise<{ markedNoShow: number }> {
    const closedBefore = new Date(now.getTime() - graceMs);

    // Deliberately NOT filtered on `payment: { status: "PAID" }`. Nothing
    // refunds a still-CONFIRMED reservation (every refund path first moves
    // it to CANCELLED_* or requires REDEEMED), so the filter would be a
    // no-op today — and if that ever stopped being true, the row it
    // excluded would sit at CONFIRMED for ever, back in the consumer's
    // AKTİF list under a dead countdown. "The window closed and nobody
    // collected this bag" is true regardless of what the payment did
    // afterwards; whether it is also SETTLEABLE is the settlement scan's
    // own question, and it asks for PAID there.
    const uncollected = await this.prisma.reservation.findMany({
      where: {
        status: { in: NO_SHOW_FROM },
        offer: { pickupEndAt: { lt: closedBefore } },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: NO_SHOW_BATCH_LIMIT,
    });

    let markedNoShow = 0;
    for (const reservation of uncollected) {
      const claimed = await this.prisma.reservation.updateMany({
        where: { id: reservation.id, status: { in: NO_SHOW_FROM } },
        data: { status: "NO_SHOW" },
      });
      // count === 0: a concurrent sweep, or — the case that matters — a
      // redeem that landed inside the grace period, already moved this
      // row. Either way it is no longer ours to take.
      if (claimed.count > 0) markedNoShow++;
    }

    return { markedNoShow };
  }
}
