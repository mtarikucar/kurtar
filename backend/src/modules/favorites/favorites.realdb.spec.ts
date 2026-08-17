import { PrismaClient } from "@prisma/client";
import { FavoritesService } from "./favorites.service";

/**
 * Real-DB proof of the ONE piece of new raw SQL this module introduces —
 * queryStoreIdsWithLiveOfferToday (discovery/live-offer.util.ts), reused
 * (not duplicated) from discovery's own query shape. Not one of brief
 * §8's five MANDATORY scenarios, but this is genuinely new SQL a mocked
 * unit test cannot verify (a typo in the JOIN/WHERE would still pass
 * every mocked assertion).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "favorites-realdb-test";

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[favorites.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

async function seedStore(
  prisma: PrismaClient,
  opts: { active?: boolean; merchantApproved?: boolean } = {},
) {
  const merchant = await prisma.merchant.create({
    data: {
      legalName: `${TAG} Gida A.S.`,
      tradeName: `${TAG} Firin`,
      taxId: `${TAG}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      iban: "TR000006701000000000000002",
      verificationStatus:
        opts.merchantApproved === false ? "SUSPENDED" : "APPROVED",
    },
  });
  const store = await prisma.store.create({
    data: {
      merchantId: merchant.id,
      name: `${TAG} Store`,
      address: "Test Sk. No:6",
      district: "Kadikoy",
      city: "Istanbul",
      latitude: 40.95,
      longitude: 28.99,
      active: opts.active ?? true,
    },
  });
  return { merchant, store };
}

async function seedLiveOffer(prisma: PrismaClient, storeId: string) {
  const bagTemplate = await prisma.bagTemplate.create({
    data: {
      storeId,
      title: `${TAG} Bag`,
      category: "BAKERY",
      allergenDisclaimer: "N/A",
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
      priceCents: 5000,
    },
  });
  return prisma.dailyOffer.create({
    data: {
      bagTemplateId: bagTemplate.id,
      storeId,
      offerDate: new Date(),
      qtyTotal: 5,
      qtyReserved: 0,
      pickupStartAt: new Date(Date.now() - 60 * 60 * 1000),
      pickupEndAt: new Date(Date.now() + 60 * 60 * 1000),
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
}

d("FavoritesService.listMine — real DB live-offer batch query", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("correctly distinguishes a store WITH a live offer from one without, one that's inactive, and one whose merchant is suspended", async () => {
    const withOffer = await seedStore(prisma);
    const withoutOffer = await seedStore(prisma);
    const inactiveStore = await seedStore(prisma, { active: false });
    const suspendedMerchantStore = await seedStore(prisma, {
      merchantApproved: false,
    });

    const liveOffer = await seedLiveOffer(prisma, withOffer.store.id);
    await seedLiveOffer(prisma, inactiveStore.store.id); // has an offer row, but the STORE is inactive
    await seedLiveOffer(prisma, suspendedMerchantStore.store.id); // has an offer row, but the MERCHANT is suspended

    const user = await prisma.user.create({
      data: { phoneE164: `+9055517${Date.now().toString().slice(-5)}` },
    });
    await prisma.favorite.createMany({
      data: [
        { userId: user.id, storeId: withOffer.store.id },
        { userId: user.id, storeId: withoutOffer.store.id },
        { userId: user.id, storeId: inactiveStore.store.id },
        { userId: user.id, storeId: suspendedMerchantStore.store.id },
      ],
    });

    const service = new FavoritesService(prisma as any);

    try {
      const result = await service.listMine(user.id, 1, 20);
      const byStoreId = new Map(result.items.map((i) => [i.storeId, i]));

      expect(byStoreId.get(withOffer.store.id)?.hasLiveOfferToday).toBe(true);
      expect(byStoreId.get(withoutOffer.store.id)?.hasLiveOfferToday).toBe(
        false,
      );
      expect(byStoreId.get(inactiveStore.store.id)?.hasLiveOfferToday).toBe(
        false,
      );
      expect(
        byStoreId.get(suspendedMerchantStore.store.id)?.hasLiveOfferToday,
      ).toBe(false);
      expect(result.total).toBe(4);
    } finally {
      await safeCleanup("favorites", () =>
        prisma.favorite.deleteMany({ where: { userId: user.id } }),
      );
      await safeCleanup("user", () =>
        prisma.user.delete({ where: { id: user.id } }),
      );
      await safeCleanup("offers", () =>
        prisma.dailyOffer.deleteMany({
          where: {
            storeId: {
              in: [
                withOffer.store.id,
                inactiveStore.store.id,
                suspendedMerchantStore.store.id,
              ],
            },
          },
        }),
      );
      await safeCleanup("bagTemplates", () =>
        prisma.bagTemplate.deleteMany({
          where: {
            storeId: {
              in: [
                withOffer.store.id,
                withoutOffer.store.id,
                inactiveStore.store.id,
                suspendedMerchantStore.store.id,
              ],
            },
          },
        }),
      );
      await safeCleanup("stores", () =>
        prisma.store.deleteMany({
          where: {
            id: {
              in: [
                withOffer.store.id,
                withoutOffer.store.id,
                inactiveStore.store.id,
                suspendedMerchantStore.store.id,
              ],
            },
          },
        }),
      );
      await safeCleanup("merchants", () =>
        prisma.merchant.deleteMany({
          where: {
            id: {
              in: [
                withOffer.merchant.id,
                withoutOffer.merchant.id,
                inactiveStore.merchant.id,
                suspendedMerchantStore.merchant.id,
              ],
            },
          },
        }),
      );
      void liveOffer;
    }
  }, 20_000);
});
