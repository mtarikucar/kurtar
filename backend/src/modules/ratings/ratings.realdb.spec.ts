import { PrismaClient } from "@prisma/client";
import { RatingsService } from "./ratings.service";

/**
 * Real-DB proof of ratings' two hardest guarantees (brief §8's mandatory
 * scenarios (a)/(b)):
 *   (a) two parallel POSTs for the SAME reservation ⇒ exactly one Rating
 *       row, the loser gets a friendly 409 (Rating.reservationId's real
 *       unique constraint, not just an application-level check).
 *   (b) Store.avgStars/ratingCount stay exactly equal to a fresh
 *       recomputation after a mixed create/approve/reject/delete
 *       sequence — the denormalized aggregate never drifts from truth.
 *
 * [I8] Every seeded row is scoped under this file's own tag and cleaned
 * up by id in afterAll — never a table-wide deleteMany (see
 * reservations.realdb.spec.ts's identical discipline for why).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "ratings-realdb-test";

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ratings.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

let phoneCounter = 0;
async function seedUser(prisma: PrismaClient) {
  const n = phoneCounter++;
  return prisma.user.create({
    data: { phoneE164: `+9055513${n.toString().padStart(5, "0")}` },
  });
}

async function seedStoreChain(prisma: PrismaClient) {
  const merchant = await prisma.merchant.create({
    data: {
      legalName: `${TAG} Gida A.S.`,
      tradeName: `${TAG} Firin`,
      taxId: `${TAG}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      iban: "TR000006701000000000000002",
      verificationStatus: "APPROVED",
    },
  });
  const store = await prisma.store.create({
    data: {
      merchantId: merchant.id,
      name: `${TAG} Store`,
      address: "Test Sk. No:3",
      district: "Kadikoy",
      city: "Istanbul",
      latitude: 40.98,
      longitude: 29.02,
    },
  });
  const bagTemplate = await prisma.bagTemplate.create({
    data: {
      storeId: store.id,
      title: `${TAG} Bag`,
      category: "BAKERY",
      allergenDisclaimer: "N/A",
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
      priceCents: 5000,
    },
  });
  return { merchant, store, bagTemplate };
}

/** A REDEEMED reservation, seeded directly (bypassing the full
 * create->pay->redeem HTTP flow — out of scope for THIS suite, already
 * covered by reservations.realdb.spec.ts). Creates its OWN BagTemplate
 * per call (rather than accepting a shared one) so repeated calls within
 * one test never collide on DailyOffer's (bagTemplateId, offerDate)
 * unique constraint. */
async function seedRedeemedReservation(
  prisma: PrismaClient,
  storeId: string,
  userId: string,
) {
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
  const offer = await prisma.dailyOffer.create({
    data: {
      bagTemplateId: bagTemplate.id,
      storeId,
      offerDate: new Date(),
      qtyTotal: 5,
      qtyReserved: 1,
      qtyRedeemed: 1,
      pickupStartAt: new Date(Date.now() - 60 * 60 * 1000),
      pickupEndAt: new Date(Date.now() + 60 * 60 * 1000),
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  const reservation = await prisma.reservation.create({
    data: {
      code: `RATE-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      userId,
      offerId: offer.id,
      storeId,
      qty: 1,
      unitPriceCents: 5000,
      totalCents: 5000,
      status: "REDEEMED",
      cancelDeadlineAt: new Date(Date.now() - 30 * 60 * 1000),
      redeemedAt: new Date(),
    },
  });
  return { offer, reservation };
}

d("RatingsService — real DB concurrency + aggregate consistency", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("[a] two parallel rating submissions for the SAME reservation: exactly one row, the other gets 409", async () => {
    const merchantIds: string[] = [];
    const { merchant, store } = await seedStoreChain(prisma);
    merchantIds.push(merchant.id);
    const user = await seedUser(prisma);
    const { reservation } = await seedRedeemedReservation(
      prisma,
      store.id,
      user.id,
    );
    const service = new RatingsService(prisma as any);

    try {
      const results = await Promise.allSettled([
        service.create(user.id, reservation.id, { overallStars: 5 }),
        service.create(user.id, reservation.id, { overallStars: 3 }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(
        (rejected[0] as PromiseRejectedResult).reason.response.errorCode,
      ).toBe("RATING_ALREADY_EXISTS");

      const rows = await prisma.rating.findMany({
        where: { reservationId: reservation.id },
      });
      expect(rows).toHaveLength(1);
    } finally {
      await safeCleanup("a: ratings", () =>
        prisma.rating.deleteMany({ where: { reservationId: reservation.id } }),
      );
      await safeCleanup("a: reservation", () =>
        prisma.reservation.delete({ where: { id: reservation.id } }),
      );
      await safeCleanup("a: offer", () =>
        prisma.dailyOffer.deleteMany({ where: { storeId: store.id } }),
      );
      await safeCleanup("a: bagTemplate", () =>
        prisma.bagTemplate.deleteMany({ where: { storeId: store.id } }),
      );
      await safeCleanup("a: store", () =>
        prisma.store.delete({ where: { id: store.id } }),
      );
      await safeCleanup("a: merchant", () =>
        prisma.merchant.delete({ where: { id: merchant.id } }),
      );
      await safeCleanup("a: user", () =>
        prisma.user.delete({ where: { id: user.id } }),
      );
    }
  });

  it("[b] Store.avgStars/ratingCount match a fresh recomputation after a mixed create/approve/reject/delete sequence", async () => {
    const { merchant, store } = await seedStoreChain(prisma);
    const users = await Promise.all([
      seedUser(prisma),
      seedUser(prisma),
      seedUser(prisma),
    ]);
    const service = new RatingsService(prisma as any);
    const reservationIds: string[] = [];
    const ratingIds: string[] = [];

    async function recomputeExpected() {
      const agg = await prisma.rating.aggregate({
        where: { storeId: store.id, moderationStatus: "APPROVED" },
        _avg: { overallStars: true },
        _count: { _all: true },
      });
      return {
        avgStars: agg._avg.overallStars ?? 0,
        ratingCount: agg._count._all,
      };
    }

    async function assertDenormalizedMatchesRecomputed() {
      const [freshStore, expected] = await Promise.all([
        prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
        recomputeExpected(),
      ]);
      expect(freshStore.ratingCount).toBe(expected.ratingCount);
      expect(freshStore.avgStars).toBeCloseTo(expected.avgStars, 10);
    }

    try {
      // 1) Uncommented rating -> auto-APPROVED (5 stars).
      const { reservation: r1 } = await seedRedeemedReservation(
        prisma,
        store.id,
        users[0].id,
      );
      reservationIds.push(r1.id);
      const rating1 = await service.create(users[0].id, r1.id, {
        overallStars: 5,
      });
      ratingIds.push(rating1.id);
      await assertDenormalizedMatchesRecomputed();

      // 2) Commented rating -> PENDING (does not move the aggregate yet).
      const { reservation: r2 } = await seedRedeemedReservation(
        prisma,
        store.id,
        users[1].id,
      );
      reservationIds.push(r2.id);
      const rating2 = await service.create(users[1].id, r2.id, {
        overallStars: 1,
        comment: "Soğuk gelmiş.",
      });
      ratingIds.push(rating2.id);
      await assertDenormalizedMatchesRecomputed();

      // 3) Admin approves rating2 -> now counts (average of 5 and 1 = 3).
      await service.adminApprove("admin-test", rating2.id);
      await assertDenormalizedMatchesRecomputed();

      // 4) A third rating, auto-approved (3 stars), then rejected by admin
      //    (content-report path reuses this exact method).
      const { reservation: r3 } = await seedRedeemedReservation(
        prisma,
        store.id,
        users[2].id,
      );
      reservationIds.push(r3.id);
      const rating3 = await service.create(users[2].id, r3.id, {
        overallStars: 3,
      });
      ratingIds.push(rating3.id);
      await assertDenormalizedMatchesRecomputed();

      await service.rejectRating("admin-test", rating3.id);
      await assertDenormalizedMatchesRecomputed();

      // 5) Delete rating1 outright (admin hard-delete).
      await service.adminDelete("admin-test", rating1.id);
      await assertDenormalizedMatchesRecomputed();

      // Final sanity: only rating2 (APPROVED, 1 star) should be counted.
      const finalStore = await prisma.store.findUniqueOrThrow({
        where: { id: store.id },
      });
      expect(finalStore.ratingCount).toBe(1);
      expect(finalStore.avgStars).toBeCloseTo(1, 10);
    } finally {
      await safeCleanup("b: ratings", () =>
        prisma.rating.deleteMany({ where: { storeId: store.id } }),
      );
      await safeCleanup("b: reservations", () =>
        prisma.reservation.deleteMany({
          where: { id: { in: reservationIds } },
        }),
      );
      await safeCleanup("b: offers", () =>
        prisma.dailyOffer.deleteMany({ where: { storeId: store.id } }),
      );
      await safeCleanup("b: bagTemplate", () =>
        prisma.bagTemplate.deleteMany({ where: { storeId: store.id } }),
      );
      await safeCleanup("b: store", () =>
        prisma.store.delete({ where: { id: store.id } }),
      );
      await safeCleanup("b: merchant", () =>
        prisma.merchant.delete({ where: { id: merchant.id } }),
      );
      await safeCleanup("b: users", () =>
        prisma.user.deleteMany({
          where: { id: { in: users.map((u) => u.id) } },
        }),
      );
    }
  });
});
