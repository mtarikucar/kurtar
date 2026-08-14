import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { PricingService } from "../settlements/pricing.service";
import { addAnniversaryYears } from "./anniversary";
import { computeMembershipVatCents } from "./membership-pricing";

export interface MembershipMineView {
  status: string;
  anchorDate: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  priceCents: number;
  vatCents: number;
  outstandingCents: number;
  outstandingVatCents: number;
  writtenOffCents: number;
  periodPaidAt: Date | null;
  nextAnniversary: Date;
}

/**
 * Creation (on merchant APPROVED, via membership-approved.handler.ts) and
 * the merchant-facing read (GET /api/merchants/me/membership). The offset
 * engine itself (decrementing outstandingCents from a settlement batch)
 * lives in membership-offset.service.ts — a distinct responsibility (money
 * math run inside settlements.service.ts's locked transaction) from this
 * file's onboarding/read concerns.
 */
@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Idempotent against a duplicate `merchant.approved.v1` delivery (the
   * outbox worker's own retry-on-transient-failure, or, theoretically, two
   * workers dispatching a stale-lease-reclaimed row — see outbox-worker.
   * service.ts) via the `membership_subscriptions_merchantId_key` unique
   * constraint: a second attempt's create() throws P2002, caught below and
   * treated as an already-created no-op rather than a hard failure.
   *
   * priceCents/vatCents (and therefore the fresh outstandingCents/
   * outstandingVatCents balance) are 0 for a founding member still inside
   * their `membershipExemptUntil` window — "first year exempt" (brief
   * §"commercial rules"). Always created TRIAL regardless — see
   * membership-offset.service.ts's doc comment for how TRIAL (and
   * PAST_DUE, after a forgiven renewal) flips to ACTIVE on the first real
   * batch that touches this subscription.
   */
  async createForApprovedMerchant(
    merchantId: string,
    approvedAt: Date,
  ): Promise<void> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { membershipExemptUntil: true },
    });
    if (!merchant) {
      this.logger.warn(
        `createForApprovedMerchant: merchant ${merchantId} no longer exists — skipping`,
      );
      return;
    }

    // [Fix round, I6] This exemption check at CREATION time only decides
    // the STARTING price for the first period — it does NOT need to
    // account for a founding-status grant that happens AFTER this point;
    // that case is handled by membership-offset.service.ts's
    // lockAndResolveDue re-checking `membershipExemptUntil` as-of every
    // batch's own period date, every time.
    const exempt =
      merchant.membershipExemptUntil != null &&
      approvedAt.getTime() < merchant.membershipExemptUntil.getTime();

    let priceCents = 0;
    let vatCents = 0;
    if (!exempt) {
      const pricing = await this.pricing.resolvePlatformPricing(
        this.prisma,
        approvedAt,
      );
      priceCents = pricing.membershipAnnualCents;
      // [Fix round, P2] KDV %20 on the membership fee, mirroring the bag
      // fee's netCents/vatCents split.
      vatCents = computeMembershipVatCents(priceCents);
    }
    const totalDueCents = priceCents + vatCents;

    try {
      await this.prisma.membershipSubscription.create({
        data: {
          merchantId,
          anchorDate: approvedAt,
          currentPeriodStart: approvedAt,
          currentPeriodEnd: addAnniversaryYears(approvedAt, 1),
          priceCents,
          vatCents,
          status: "TRIAL",
          outstandingCents: totalDueCents,
          outstandingVatCents: vatCents,
          periodPaidAt: totalDueCents === 0 ? approvedAt : null,
        },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err, "merchantId")) {
        this.logger.warn(
          `createForApprovedMerchant: merchant ${merchantId} already has a subscription — duplicate merchant.approved.v1 delivery, no-op`,
        );
        return;
      }
      throw err;
    }
  }

  async getMine(merchantId: string): Promise<MembershipMineView> {
    const sub = await this.prisma.membershipSubscription.findUnique({
      where: { merchantId },
    });
    if (!sub) {
      throw new NotFoundException({
        statusCode: 404,
        errorCode: "MEMBERSHIP_NOT_FOUND",
        message:
          "No membership subscription found — expected one to exist from merchant approval onward.",
      });
    }
    return {
      status: sub.status,
      anchorDate: sub.anchorDate,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      priceCents: sub.priceCents,
      vatCents: sub.vatCents,
      outstandingCents: sub.outstandingCents,
      outstandingVatCents: sub.outstandingVatCents,
      writtenOffCents: sub.writtenOffCents,
      periodPaidAt: sub.periodPaidAt,
      nextAnniversary: sub.currentPeriodEnd,
    };
  }
}
