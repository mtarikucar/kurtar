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

  describe("[Fix round, Minor] cache-miss stampede — single-flight coalescing", () => {
    it("N concurrent cache-misses fire exactly ONE aggregate query, and all callers get the same result", async () => {
      let resolveAggregate!: (value: unknown) => void;
      const aggregatePromise = new Promise((resolve) => {
        resolveAggregate = resolve;
      });
      const aggregate = jest.fn().mockReturnValue(aggregatePromise);
      const { prisma, cache } = buildDeps({
        impactLedger: { aggregate },
      });
      const service = new ImpactService(prisma as any, cache as any);

      // Fire 5 concurrent callers, all landing on the SAME cache miss —
      // exactly the burst that hits right after the 5-minute TTL lapses.
      const calls = [
        service.getPublic(),
        service.getPublic(),
        service.getPublic(),
        service.getPublic(),
        service.getPublic(),
      ];

      // Give the microtask queue a turn so every caller has already
      // passed its own `cache.get` miss and reached the coalescing point.
      await Promise.resolve();
      await Promise.resolve();

      expect(aggregate).toHaveBeenCalledTimes(1);

      resolveAggregate({
        _sum: { mealsSaved: 9, co2eGrams: 1, moneySavedCents: 1 },
        _count: { _all: 9 },
      });

      const results = await Promise.all(calls);
      expect(aggregate).toHaveBeenCalledTimes(1);
      for (const result of results) {
        expect(result).toMatchObject({ mealsSaved: 9, count: 9 });
      }
      // Only one cache-fill for the one recompute, not one per caller.
      expect(cache.set).toHaveBeenCalledTimes(1);
    });

    it("a FOLLOW-UP miss (after the in-flight recompute already settled) starts its OWN new recompute rather than reusing the stale in-flight promise forever", async () => {
      const aggregate = jest
        .fn()
        .mockResolvedValueOnce({
          _sum: { mealsSaved: 1, co2eGrams: 1, moneySavedCents: 1 },
          _count: { _all: 1 },
        })
        .mockResolvedValueOnce({
          _sum: { mealsSaved: 2, co2eGrams: 2, moneySavedCents: 2 },
          _count: { _all: 2 },
        });
      const { prisma, cache } = buildDeps({ impactLedger: { aggregate } });
      const service = new ImpactService(prisma as any, cache as any);

      const first = await service.getPublic();
      expect(first).toMatchObject({ mealsSaved: 1 });

      // Simulate the cache having expired again by the time of the
      // second call (buildDeps' cache.get always returns null anyway).
      const second = await service.getPublic();
      expect(second).toMatchObject({ mealsSaved: 2 });

      expect(aggregate).toHaveBeenCalledTimes(2);
    });
  });
});
