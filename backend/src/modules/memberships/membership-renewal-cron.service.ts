import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { PricingService } from "../settlements/pricing.service";
import { addAnniversaryYears } from "./anniversary";

/**
 * Daily renewal sweep (brief §4: "Renewal cron: on anniversary, open a new
 * period with a fresh outstanding balance (indexed price)"). Runs once a
 * day — a subscription's `currentPeriodEnd` only ever needs checking
 * against "has today passed it", never more granular than that.
 *
 * FRESH BALANCE, LITERALLY: any unrecovered `outstandingCents` from the
 * period that just ended is NOT carried into the new period — the new
 * period's `outstandingCents` is exactly the new period's own (indexed)
 * price, per the brief's literal wording. This is a deliberate policy
 * choice (a low-volume merchant's unpaid membership balance is forgiven
 * at the year boundary rather than compounding into permanent debt), not
 * an oversight — flagged in task-8-report.md for product/finance to
 * confirm explicitly.
 *
 * `currentPeriodEnd` rolls forward from ITS OWN prior value (not
 * recomputed from `anchorDate` + total elapsed years) — both land on the
 * same result for a subscription that renews on schedule, but rolling
 * from the prior value is what keeps a subscription that missed several
 * renewal ticks (a cron outage) catching up one year at a time in the
 * loop below, rather than jumping straight to "now" and skipping whatever
 * price was effective during the skipped year(s).
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
  async runOnce(now: Date): Promise<{ renewed: number }> {
    const due = await this.prisma.membershipSubscription.findMany({
      where: { currentPeriodEnd: { lte: now } },
    });

    let renewed = 0;
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

      const priceCents = exempt
        ? 0
        : (await this.pricing.resolvePlatformPricing(this.prisma, periodStart))
            .membershipAnnualCents;

      await this.prisma.membershipSubscription.update({
        where: { id: sub.id },
        data: {
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          priceCents,
          outstandingCents: priceCents,
          periodPaidAt: priceCents === 0 ? periodStart : null,
        },
      });
      renewed++;
    }

    if (renewed > 0) {
      this.logger.log(`Membership renewal: renewed ${renewed} subscription(s)`);
    }
    return { renewed };
  }
}
