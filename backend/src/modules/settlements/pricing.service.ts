import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface ResolvedPlatformPricing {
  bagFeeCents: number;
  membershipAnnualCents: number;
  effectiveFrom: Date;
}

/**
 * Price-as-of-period-date lookups (brief §5) — a price change is a NEW
 * `platform_pricing` row with a future `effectiveFrom`, never an UPDATE of
 * an existing one, so a settlement batch computed for a period BEFORE a
 * price change keeps resolving the SAME price forever, even after the
 * change ships (proven by settlements.realdb.spec.ts's price-change-mid-
 * life scenario).
 *
 * Every resolver takes an explicit `tx` (a `Prisma.TransactionClient`),
 * never falling back to `this.prisma` — every real caller in this task
 * (settlements.service.ts's batch recompute) already holds a row lock
 * inside a transaction by the time it needs a price, and requiring `tx`
 * here makes that the only way to call these methods, rather than a
 * second untransacted read racing the locked one.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePlatformPricing(
    tx: Prisma.TransactionClient,
    asOf: Date,
  ): Promise<ResolvedPlatformPricing> {
    const pricing = await tx.platformPricing.findFirst({
      where: { effectiveFrom: { lte: asOf } },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!pricing) {
      // Should be unreachable in any real deploy — the migration that
      // creates this table also seeds an initial row effective from
      // before the migration can ever run (see that migration's doc
      // comment). Surfacing loudly rather than silently defaulting is the
      // right posture for a money input with no safe fallback value.
      throw new Error(
        `No PlatformPricing row is effective on or before ${asOf.toISOString()} — seed migration missing or reverted?`,
      );
    }
    return pricing;
  }

  /** The fixed per-bag fee this merchant pays, as of `asOf`. A merchant's
   * own `bagFeeCentsOverride` (founding-member locked rate) wins
   * unconditionally when set — it does not itself vary by date, unlike
   * the platform default. */
  async resolveBagFeeCentsForMerchant(
    tx: Prisma.TransactionClient,
    merchant: { bagFeeCentsOverride: number | null },
    asOf: Date,
  ): Promise<number> {
    if (merchant.bagFeeCentsOverride != null) {
      return merchant.bagFeeCentsOverride;
    }
    return (await this.resolvePlatformPricing(tx, asOf)).bagFeeCents;
  }

  /** Admin surface (POST /api/admin/pricing) — always a NEW row, never an
   * UPDATE. `effectiveFrom` in the past is rejected: it would silently
   * change how already-computed (but not yet frozen/SENT) batches
   * recompute, which is exactly the history-mutation this table exists to
   * prevent — a genuine backdated correction should go through a manual
   * admin adjustment on the affected batch instead, not a pricing rewrite. */
  async scheduleFuturePricing(params: {
    bagFeeCents: number;
    membershipAnnualCents: number;
    effectiveFrom: Date;
  }): Promise<ResolvedPlatformPricing & { id: string }> {
    if (params.effectiveFrom.getTime() <= Date.now()) {
      // [Fix round, I9] A proper HTTP exception, not a bare Error — this
      // is reachable directly from AdminPricingController, and a bare
      // Error was surfacing as a bodyless 500 instead of this project's
      // {statusCode, errorCode, message} taxonomy every other admin
      // endpoint uses.
      throw new BadRequestException({
        statusCode: 400,
        errorCode: "PRICING_EFFECTIVE_FROM_NOT_FUTURE",
        message:
          "effectiveFrom must be in the future — a price change never rewrites already-priced history.",
      });
    }
    return this.prisma.platformPricing.create({ data: params });
  }

  async listPricing(): Promise<(ResolvedPlatformPricing & { id: string })[]> {
    return this.prisma.platformPricing.findMany({
      orderBy: { effectiveFrom: "desc" },
    });
  }
}
