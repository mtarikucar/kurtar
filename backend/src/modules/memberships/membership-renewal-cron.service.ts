import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { PricingService } from "../settlements/pricing.service";
import { addAnniversaryYears } from "./anniversary";
import { computeMembershipVatCents } from "./membership-pricing";

/**
 * Daily renewal sweep (brief §4: "Renewal cron: on anniversary, open a new
 * period with a fresh outstanding balance (indexed price)"). Runs once a
 * day — a subscription's `currentPeriodEnd` only ever needs checking
 * against "has today passed it", never more granular than that.
 *
 * [Fix round, I7] Only TRIAL/ACTIVE/PAST_DUE subscriptions are due for
 * renewal — a CANCELLED one must never be silently re-opened and re-billed
 * on its next anniversary just because nothing else updates
 * `currentPeriodEnd` for it (the original query had no status filter at
 * all: a merchant who cancelled would have been renewed and re-billed
 * every year forever).
 *
 * [Fix round, P1] FORGIVENESS IS POLICY, NOT SILENCE: any unrecovered
 * `outstandingCents` from the period that just ended is NOT carried into
 * the new period as debt — the new period's `outstandingCents` is exactly
 * the new period's own (indexed, VAT-inclusive) price. This is TGTG's "you
 * don't pay until you earn" model: a merchant who never earned the fee
 * this period never owes it, and carrying it forward would penalise a
 * dormant merchant for simply not having sales. But "forgiven" must never
 * mean "untracked": every time a rollover writes off a nonzero balance,
 * this method (1) appends an AuditLog row recording the exact amount,
 * merchant, and period, so "how much membership revenue did we write off
 * last year" is a plain AuditLog query; (2) adds that amount to the
 * subscription's own cumulative `writtenOffCents` (schema.prisma's
 * MembershipSubscription — the fast per-merchant answer, no join needed);
 * (3) logs at warn (a write-off is not routine info-level noise — an
 * operator scanning logs should see it); (4) flips the subscription's
 * status to PAST_DUE for the NEW period rather than silently starting it
 * as if nothing happened. PAST_DUE here means "last period closed
 * unrecovered and was forgiven, not yet re-earned" — not "currently owes
 * carried debt" (there is none; the new period's balance is fresh). It
 * clears back to ACTIVE the moment the new period gets its first real
 * settlement offset (membership-offset.service.ts's `needsActivation`
 * already treats TRIAL and PAST_DUE identically for that flip). A
 * subscription that closes its period FULLY recovered (outstandingCents
 * already 0) has nothing to forgive and keeps its current status as-is —
 * renewal alone is not a demotion.
 *
 * `currentPeriodEnd` rolls forward from ITS OWN prior value (not
 * recomputed from `anchorDate` + total elapsed years) — both land on the
 * same result for a subscription that renews on schedule, but rolling
 * from the prior value is what keeps a subscription that missed several
 * renewal ticks (a cron outage) catching up one year at a time in the
 * loop below, rather than jumping straight to "now" and skipping whatever
 * price was effective during the skipped year(s). A multi-year catch-up
 * still only produces ONE write-off record per renewal run: no offset
 * activity can have happened against a subscription during years it
 * skipped over entirely (the settlement engine would have already lowered
 * `outstandingCents` below what's read here if it had), so the balance
 * carried into this method is exactly what's owed regardless of how many
 * anniversaries were skipped in a single pass.
 */
@Injectable()
export class MembershipRenewalCronService {
  private readonly logger = new Logger(MembershipRenewalCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  @Cron("0 3 * * *", { name: "membership-renewal" }) // 03:00 server time, daily
  async renewDueSubscriptions(): Promise<void> {
    await this.runOnce(new Date());
  }

  /** Not private — realdb specs call this directly with an injected `now`
   * rather than waiting on the cron schedule (no wall-clock sleeps). */
  async runOnce(now: Date): Promise<{ renewed: number; writtenOff: number }> {
    const due = await this.prisma.membershipSubscription.findMany({
      where: {
        currentPeriodEnd: { lte: now },
        status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] },
      },
    });

    let renewed = 0;
    let writtenOff = 0;
    for (const sub of due) {
      // A subscription that missed multiple renewal ticks (rare — a cron
      // outage) rolls forward one year at a time until its period once
      // again covers `now`, each year re-resolving whatever price was
      // effective for THAT specific renewal instant.
      let periodStart = sub.currentPeriodEnd;
      let periodEnd = addAnniversaryYears(periodStart, 1);
      while (periodEnd.getTime() <= now.getTime()) {
        periodStart = periodEnd;
        periodEnd = addAnniversaryYears(periodStart, 1);
      }

      const merchant = await this.prisma.merchant.findUnique({
        where: { id: sub.merchantId },
        select: { membershipExemptUntil: true },
      });
      const exempt =
        merchant?.membershipExemptUntil != null &&
        periodStart.getTime() < merchant.membershipExemptUntil.getTime();

      let priceCents = 0;
      let vatCents = 0;
      if (!exempt) {
        priceCents = (
          await this.pricing.resolvePlatformPricing(this.prisma, periodStart)
        ).membershipAnnualCents;
        // [Fix round, P2] The ended-period gap was priceCents-only for
        // every renewal after the first — VAT was computed at initial
        // creation (memberships.service.ts) but never again here, so
        // every year-2+ period silently had outstandingVatCents=0.
        vatCents = computeMembershipVatCents(priceCents);
      }
      const totalDueCents = priceCents + vatCents;

      // [Fix round, P1] The just-ended period's unrecovered balance,
      // BEFORE it gets overwritten below with the new period's fresh
      // value — this is what gets forgiven-and-recorded, never silently
      // dropped.
      const writeOffCents = sub.outstandingCents;

      await this.prisma.$transaction(async (tx) => {
        if (writeOffCents > 0) {
          await tx.auditLog.create({
            data: {
              actorType: "SYSTEM",
              action: "membership.renewal.written_off",
              entity: "MembershipSubscription",
              entityId: sub.id,
              diffJson: {
                merchantId: sub.merchantId,
                writtenOffCents: writeOffCents,
                endedPeriodStart: sub.currentPeriodStart.toISOString(),
                endedPeriodEnd: sub.currentPeriodEnd.toISOString(),
                newPeriodStart: periodStart.toISOString(),
                newPeriodEnd: periodEnd.toISOString(),
                reason:
                  "Period ended with an unrecovered membership balance — forgiven at renewal per policy (a merchant who never earned the fee never owes it), not carried forward as debt.",
              },
            },
          });
        }

        await tx.membershipSubscription.update({
          where: { id: sub.id },
          data: {
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            priceCents,
            vatCents,
            outstandingCents: totalDueCents,
            outstandingVatCents: vatCents,
            periodPaidAt: totalDueCents === 0 ? periodStart : null,
            ...(writeOffCents > 0
              ? {
                  writtenOffCents: { increment: writeOffCents },
                  // Forgiven, not carried — the new period starts fresh,
                  // but the subscription itself is flagged PAST_DUE (last
                  // period closed unrecovered) rather than silently
                  // looking untouched. Clears back to ACTIVE on the new
                  // period's first real settlement offset.
                  status: "PAST_DUE",
                }
              : {}),
          },
        });
      });

      if (writeOffCents > 0) {
        this.logger.warn(
          `Membership renewal write-off: merchant ${sub.merchantId} subscription ${sub.id} — ${writeOffCents} kuruş forgiven at period rollover (${sub.currentPeriodStart.toISOString()} .. ${sub.currentPeriodEnd.toISOString()})`,
        );
        writtenOff++;
      }
      renewed++;
    }

    if (renewed > 0) {
      this.logger.log(
        `Membership renewal: renewed ${renewed} subscription(s), ${writtenOff} with a write-off`,
      );
    }
    return { renewed, writtenOff };
  }
}
