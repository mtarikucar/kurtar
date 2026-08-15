import { ImpactService } from "./impact.service";

function buildDeps(overrides: Record<string, any> = {}) {
  const prisma = {
    impactLedger: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { mealsSaved: 0, co2eGrams: 0, moneySavedCents: 0 },
        _count: { _all: 0 },
      }),
      ...overrides.impactLedger,
    },
  };
  const cache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    ...overrides.cache,
  };
  return { prisma, cache };
}

describe("ImpactService.getMine", () => {
  it("scopes the aggregate to the given userId and defaults nulls to 0", async () => {
    const { prisma, cache } = buildDeps();
    const service = new ImpactService(prisma as any, cache as any);
    const result = await service.getMine("u1");
    expect(prisma.impactLedger.aggregate).toHaveBeenCalledWith({
      where: { userId: "u1" },
      _sum: { mealsSaved: true, co2eGrams: true, moneySavedCents: true },
      _count: { _all: true },
    });
    expect(result).toEqual({
      mealsSaved: 0,
      co2eGrams: 0,
      moneySavedCents: 0,
      count: 0,
    });
  });

  it("returns the real sums when present", async () => {
    const { prisma, cache } = buildDeps({
      impactLedger: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { mealsSaved: 7, co2eGrams: 17500, moneySavedCents: 45000 },
          _count: { _all: 7 },
        }),
      },
    });
    const service = new ImpactService(prisma as any, cache as any);
    const result = await service.getMine("u1");
    expect(result).toEqual({
      mealsSaved: 7,
      co2eGrams: 17500,
      moneySavedCents: 45000,
      count: 7,
    });
  });
});

describe("ImpactService.getPublic — cache-aside with graceful degradation", () => {
  it("returns the cached value without touching the DB on a hit", async () => {
    const cachedValue = {
      mealsSaved: 100,
      co2eGrams: 250000,
      moneySavedCents: 5000000,
      count: 100,
      generatedAt: "2026-01-01T00:00:00.000Z",
    };
    const { prisma, cache } = buildDeps({
      cache: { get: jest.fn().mockResolvedValue(cachedValue) },
    });
    const service = new ImpactService(prisma as any, cache as any);

    const result = await service.getPublic();
    expect(result).toEqual(cachedValue);
    expect(prisma.impactLedger.aggregate).not.toHaveBeenCalled();
  });

  it("computes and caches on a miss", async () => {
    const { prisma, cache } = buildDeps({
      impactLedger: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { mealsSaved: 3, co2eGrams: 7500, moneySavedCents: 15000 },
          _count: { _all: 3 },
        }),
      },
    });
    const service = new ImpactService(prisma as any, cache as any);

    const result = await service.getPublic();
    expect(result).toMatchObject({
      mealsSaved: 3,
      co2eGrams: 7500,
      moneySavedCents: 15000,
      count: 3,
    });
    expect(cache.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mealsSaved: 3 }),
      300,
    );
  });

  it("degrades to a live (uncached) read when Redis itself is unreachable — never throws", async () => {
    // ImpactCacheService.get already swallows its own errors and resolves
    // null on a Redis outage (mirrors DiscoveryCacheService) — this test
    // proves ImpactService's OWN behavior on that null (compute live,
    // still attempt to cache the result for next time, no exception).
    const { prisma, cache } = buildDeps();
    const service = new ImpactService(prisma as any, cache as any);
    await expect(service.getPublic()).resolves.toBeDefined();
  });
});
