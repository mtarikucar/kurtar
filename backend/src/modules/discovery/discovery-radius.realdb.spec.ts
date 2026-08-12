import { ConfigService } from "@nestjs/config";
import {
  BagCategory,
  DietFlag,
  OfferStatus,
  PrismaClient,
} from "@prisma/client";
import { DiscoveryCacheService } from "./discovery-cache.service";
import { DiscoveryService } from "./discovery.service";
import type { DiscoveryOffersQueryDto } from "./dto/discovery-offers-query.dto";

/**
 * Real-DB proof of the PostGIS discovery query (§4/§5 of the Task 5
 * brief) — the ST_DWithin radius search, distance ordering, qtyLeft,
 * category/diet filters, and PUBLISHED-only visibility, all against a
 * genuinely applied migration (not a mocked query builder). Only runs
 * when TEST_DATABASE_URL is set (Task 2/3/4's realdb gate pattern).
 *
 * The harness builds DiscoveryCacheService with NO REDIS_URL configured
 * (get() returns undefined) so it stays permanently in its degraded,
 * always-miss state — every searchOffers() call in this file hits the
 * live DB query, never a stale cached result from an earlier assertion in
 * the same run. DiscoveryCacheService's own cache-hit/degradation
 * behavior is covered by discovery-cache.service.spec.ts, not here.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

// Search origin + stores placed at increasing distance due north of it —
// a pure latitude offset keeps "how far is this store" simple arithmetic
// (1 degree of latitude is ~111.32km everywhere, unlike longitude).
const SEARCH_LAT = 41.0;
const SEARCH_LNG = 29.0;
const METERS_PER_DEGREE_LAT = 111_320;

function latAtDistance(meters: number): number {
  return SEARCH_LAT + meters / METERS_PER_DEGREE_LAT;
}

function buildHarness(prisma: PrismaClient) {
  const cache = new DiscoveryCacheService({
    get: () => undefined,
  } as unknown as ConfigService);
  cache.onModuleInit();
  const service = new DiscoveryService(prisma as any, cache);
  return { service };
}

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[discovery-radius.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

async function seedStore(
  prisma: PrismaClient,
  merchantId: string,
  name: string,
  distanceM: number,
) {
  const store = await prisma.store.create({
    data: {
      merchantId,
      name,
      address: "Test Sk. No:1",
      district: "Kadıköy",
      city: "İstanbul",
      latitude: latAtDistance(distanceM),
      longitude: SEARCH_LNG,
    },
  });
  await prisma.$executeRaw`
    UPDATE "stores"
    SET "location" = ST_SetSRID(ST_MakePoint(${store.longitude}, ${store.latitude}), 4326)::geography
    WHERE "id" = ${store.id}
  `;
  return store;
}

let templateSeedCounter = 0;

async function seedOffer(
  prisma: PrismaClient,
  storeId: string,
  opts: {
    category?: BagCategory;
    dietFlags?: DietFlag[];
    status?: OfferStatus;
    qtyTotal?: number;
    qtyReserved?: number;
  } = {},
) {
  const n = templateSeedCounter++;
  const bagTemplate = await prisma.bagTemplate.create({
    data: {
      storeId,
      title: `Discovery Realdb Test Bag ${n}`,
      category: opts.category ?? "MEAL",
      dietFlags: opts.dietFlags ?? [],
      allergenDisclaimer: "N/A",
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
      priceCents: 5900,
    },
  });
  const pickupStartAt = new Date(Date.now() + 3 * 60 * 60 * 1000 + n * 1000);
  const pickupEndAt = new Date(Date.now() + 5 * 60 * 60 * 1000 + n * 1000);
  const offer = await prisma.dailyOffer.create({
    data: {
      bagTemplateId: bagTemplate.id,
      storeId,
      offerDate: new Date(pickupStartAt.toISOString().slice(0, 10)),
      qtyTotal: opts.qtyTotal ?? 5,
      qtyReserved: opts.qtyReserved ?? 0,
      pickupStartAt,
      pickupEndAt,
      status: opts.status ?? "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  return { bagTemplate, offer };
}

function offersQuery(
  overrides: Partial<DiscoveryOffersQueryDto> = {},
): DiscoveryOffersQueryDto {
  return {
    lat: SEARCH_LAT,
    lng: SEARCH_LNG,
    radiusM: 3000,
    page: 1,
    pageSize: 20,
    ...overrides,
  } as DiscoveryOffersQueryDto;
}

d("DiscoveryService — real DB radius search", () => {
  let prisma: PrismaClient;
  let merchantId: string;
  let store500Id: string;
  let store2kmId: string;
  let store10kmId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL! } },
    });

    const merchant = await prisma.merchant.create({
      data: {
        legalName: "Discovery Realdb Test A.Ş.",
        tradeName: "Discovery Realdb Test Fırın",
        taxId: `DISC${Date.now()}`.slice(0, 10),
        iban: "TR330006100519786457841326",
        // Explicit APPROVED — a review found this spec previously relied
        // on the schema's DRAFT default (never set explicitly here) and
        // still asserted the offers WERE visible, which meant it was
        // silently codifying the exact hole it should have caught: nothing
        // in discovery.service.ts filtered by merchant verificationStatus
        // at all, so a DRAFT (or SUSPENDED) merchant's offers were just as
        // visible as an APPROVED one's. See the dedicated
        // "non-APPROVED merchant" test below for the negative case.
        verificationStatus: "APPROVED",
      },
    });
    merchantId = merchant.id;

    const [store500, store2km, store10km] = await Promise.all([
      seedStore(prisma, merchantId, "Store 500m", 500),
      seedStore(prisma, merchantId, "Store 2km", 2000),
      seedStore(prisma, merchantId, "Store 10km", 10000),
    ]);
    store500Id = store500.id;
    store2kmId = store2km.id;
    store10kmId = store10km.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const storeIds = [store500Id, store2kmId, store10kmId];
    await safeCleanup("dailyOffer", () =>
      prisma.dailyOffer.deleteMany({ where: { storeId: { in: storeIds } } }),
    );
    await safeCleanup("bagTemplate", () =>
      prisma.bagTemplate.deleteMany({ where: { storeId: { in: storeIds } } }),
    );
    await safeCleanup("store", () =>
      prisma.store.deleteMany({ where: { id: { in: storeIds } } }),
    );
    await safeCleanup("merchant", () =>
      prisma.merchant.delete({ where: { id: merchantId } }),
    );
    await prisma.$disconnect();
  });

  it("radius 3000 returns exactly the 2 in-range stores, distance-ordered, with correct qtyLeft", async () => {
    const { service } = buildHarness(prisma);
    const { offer: offerNear } = await seedOffer(prisma, store500Id, {
      qtyTotal: 5,
      qtyReserved: 2,
    });
    const { offer: offerMid } = await seedOffer(prisma, store2kmId, {
      qtyTotal: 3,
    });
    await seedOffer(prisma, store10kmId, {}); // ~10km — must never appear at radius 3000

    const result = await service.searchOffers(offersQuery());

    expect(result.items.map((i) => i.offerId)).toEqual([
      offerNear.id,
      offerMid.id,
    ]);
    expect(result.total).toBe(2);
    expect(result.items[0].store.distanceM).toBeLessThan(
      result.items[1].store.distanceM,
    );
    // Sanity: the reported distances are in the right ballpark for the
    // ~500m/~2km fixtures (not just "smaller than the other one").
    expect(result.items[0].store.distanceM).toBeLessThan(1000);
    expect(result.items[1].store.distanceM).toBeGreaterThan(1000);
    expect(result.items[1].store.distanceM).toBeLessThan(3000);

    expect(result.items[0].qtyLeft).toBe(3); // 5 - 2
    expect(result.items[1].qtyLeft).toBe(3); // 3 - 0
  }, 15_000);

  it("category and diet filters narrow the result; SOLD_OUT and CLOSED offers never surface", async () => {
    const { service } = buildHarness(prisma);
    const { offer: bakeryVeganOffer } = await seedOffer(prisma, store500Id, {
      category: "BAKERY",
      dietFlags: ["VEGAN"],
    });
    const { offer: groceryOffer } = await seedOffer(prisma, store500Id, {
      category: "GROCERY",
    });
    const { offer: soldOutOffer } = await seedOffer(prisma, store500Id, {
      status: "SOLD_OUT",
    });
    const { offer: closedOffer } = await seedOffer(prisma, store500Id, {
      status: "CLOSED",
    });

    const byCategory = await service.searchOffers(
      offersQuery({ category: "BAKERY" }),
    );
    expect(byCategory.items.map((i) => i.offerId)).toEqual([
      bakeryVeganOffer.id,
    ]);

    const byDiet = await service.searchOffers(offersQuery({ diet: "VEGAN" }));
    expect(byDiet.items.map((i) => i.offerId)).toEqual([bakeryVeganOffer.id]);

    const unfiltered = await service.searchOffers(offersQuery());
    const unfilteredIds = unfiltered.items.map((i) => i.offerId);
    expect(unfilteredIds).toEqual(
      expect.arrayContaining([bakeryVeganOffer.id, groceryOffer.id]),
    );
    expect(unfilteredIds).not.toContain(soldOutOffer.id);
    expect(unfilteredIds).not.toContain(closedOffer.id);
  }, 15_000);

  it("a DRAFT merchant's and a SUSPENDED merchant's PUBLISHED offers never surface, even in-radius", async () => {
    const { service } = buildHarness(prisma);

    // Self-contained fixture (own merchants/stores/offers, own cleanup at
    // the end of this test) — deliberately NOT sharing the describe-level
    // APPROVED merchant, since the whole point is a DIFFERENT merchant
    // whose verificationStatus is NOT APPROVED.
    const draftMerchant = await prisma.merchant.create({
      data: {
        legalName: "Draft Merchant Discovery Realdb Test",
        tradeName: "Draft Merchant Discovery Realdb Test",
        taxId: `DISCD${Date.now()}`.slice(0, 10),
        iban: "TR330006100519786457841326",
        // verificationStatus defaults to DRAFT — never approved.
      },
    });
    const suspendedMerchant = await prisma.merchant.create({
      data: {
        legalName: "Suspended Merchant Discovery Realdb Test",
        tradeName: "Suspended Merchant Discovery Realdb Test",
        taxId: `DISCS${Date.now()}`.slice(0, 10),
        iban: "TR330006100519786457841326",
        verificationStatus: "SUSPENDED",
      },
    });

    const draftStore = await seedStore(
      prisma,
      draftMerchant.id,
      "Draft Merchant Store",
      100,
    );
    const suspendedStore = await seedStore(
      prisma,
      suspendedMerchant.id,
      "Suspended Merchant Store",
      100,
    );

    const { offer: draftOffer } = await seedOffer(prisma, draftStore.id, {});
    const { offer: suspendedOffer } = await seedOffer(
      prisma,
      suspendedStore.id,
      {},
    );

    try {
      const result = await service.searchOffers(offersQuery({ radiusM: 3000 }));
      const ids = result.items.map((i) => i.offerId);

      expect(ids).not.toContain(draftOffer.id);
      expect(ids).not.toContain(suspendedOffer.id);

      // Also prove the storeProfile surface hides them (404s), and the map
      // surface omits their pins — both discovery entry points, not just
      // the offers list.
      await expect(service.storeProfile(draftStore.id)).rejects.toMatchObject({
        response: { errorCode: "STORE_NOT_FOUND" },
      });
      await expect(
        service.storeProfile(suspendedStore.id),
      ).rejects.toMatchObject({ response: { errorCode: "STORE_NOT_FOUND" } });

      const pins = await service.map({
        west: SEARCH_LNG - 0.02,
        south: SEARCH_LAT - 0.02,
        east: SEARCH_LNG + 0.02,
        north: SEARCH_LAT + 0.02,
      } as any);
      const pinStoreIds = pins.map((p) => p.storeId);
      expect(pinStoreIds).not.toContain(draftStore.id);
      expect(pinStoreIds).not.toContain(suspendedStore.id);
    } finally {
      await safeCleanup("dailyOffer (draft/suspended fixture)", () =>
        prisma.dailyOffer.deleteMany({
          where: { storeId: { in: [draftStore.id, suspendedStore.id] } },
        }),
      );
      await safeCleanup("bagTemplate (draft/suspended fixture)", () =>
        prisma.bagTemplate.deleteMany({
          where: { storeId: { in: [draftStore.id, suspendedStore.id] } },
        }),
      );
      await safeCleanup("store (draft/suspended fixture)", () =>
        prisma.store.deleteMany({
          where: { id: { in: [draftStore.id, suspendedStore.id] } },
        }),
      );
      await safeCleanup("merchant (draft/suspended fixture)", () =>
        prisma.merchant.deleteMany({
          where: { id: { in: [draftMerchant.id, suspendedMerchant.id] } },
        }),
      );
    }
  }, 15_000);

  it("an offer on a deactivated BagTemplate never surfaces, even if the DailyOffer row itself is PUBLISHED", async () => {
    const { service } = buildHarness(prisma);
    const { bagTemplate, offer } = await seedOffer(prisma, store500Id, {});
    await prisma.bagTemplate.update({
      where: { id: bagTemplate.id },
      data: { active: false },
    });

    const result = await service.searchOffers(offersQuery());
    expect(result.items.map((i) => i.offerId)).not.toContain(offer.id);
  }, 15_000);
});
