import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ImpactCacheService } from "./impact-cache.service";

const PUBLIC_IMPACT_CACHE_KEY = "impact:public:v1";
const PUBLIC_IMPACT_CACHE_TTL_SECONDS = 5 * 60;

export interface ImpactTotals {
  mealsSaved: number;
  co2eGrams: number;
  moneySavedCents: number;
  count: number;
}

export interface PublicImpactTotals extends ImpactTotals {
  generatedAt: string;
}

/**
 * Impact totals (brief §3). getMine is a per-user, private aggregate —
 * small (bounded by one person's own reservation history), fine to run
 * live on every call. getPublic is the platform-wide figure for the
 * landing page: @Public, so it is ALWAYS served from the 5-minute Redis
 * cache (ImpactCacheService) rather than a live full-table aggregate on
 * an unauthenticated, potentially high-traffic endpoint — mirroring
 * DiscoveryCacheService's cache-aside pattern (check cache, compute+store
 * on miss, degrade to an uncached live read if Redis itself is down
 * rather than ever 500ing).
 */
@Injectable()
export class ImpactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ImpactCacheService,
  ) {}

  async getMine(userId: string): Promise<ImpactTotals> {
    const agg = await this.prisma.impactLedger.aggregate({
      where: { userId },
      _sum: { mealsSaved: true, co2eGrams: true, moneySavedCents: true },
      _count: { _all: true },
    });
    return {
      mealsSaved: agg._sum.mealsSaved ?? 0,
      co2eGrams: agg._sum.co2eGrams ?? 0,
      moneySavedCents: agg._sum.moneySavedCents ?? 0,
      count: agg._count._all,
    };
  }

  async getPublic(): Promise<PublicImpactTotals> {
    const cached = await this.cache.get<PublicImpactTotals>(
      PUBLIC_IMPACT_CACHE_KEY,
    );
    if (cached) return cached;

    const result = await this.computePublicTotals();
    await this.cache.set(
      PUBLIC_IMPACT_CACHE_KEY,
      result,
      PUBLIC_IMPACT_CACHE_TTL_SECONDS,
    );
    return result;
  }

  private async computePublicTotals(): Promise<PublicImpactTotals> {
    const agg = await this.prisma.impactLedger.aggregate({
      _sum: { mealsSaved: true, co2eGrams: true, moneySavedCents: true },
      _count: { _all: true },
    });
    return {
      mealsSaved: agg._sum.mealsSaved ?? 0,
      co2eGrams: agg._sum.co2eGrams ?? 0,
      moneySavedCents: agg._sum.moneySavedCents ?? 0,
      count: agg._count._all,
      generatedAt: new Date().toISOString(),
    };
  }
}
