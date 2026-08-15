import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { ReservationsService } from "./reservations.service";
import { OfferStockService } from "./offer-stock.service";
import * as reservationCodeUtil from "./reservation-code.util";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { OutboxService } from "../outbox/outbox.service";

/**
 * Real-DB concurrency proof for the reservations state machine — Task 4's
 * two hardest races (oversell, redeem-idempotency) plus the cancel
 * compensation path, and (I3) proof that a reservation-code collision
 * retries the WHOLE transaction against real Postgres. Only runs when
 * TEST_DATABASE_URL is set (Task 2/3's realdb gate pattern — see
 * prisma/schema.realdb.spec.ts, auth-refresh-rotation.realdb.spec.ts). See
 * payment-settle.realdb.spec.ts for the webhook/sweeper side of the same
 * state machine.
 *
 * [I8] Every cleanup delete below is scoped to THIS suite's own rows
 * (this suite's storeId, this suite's phone prefix) rather than table-wide
 * `deleteMany({})` calls — Jest's `--maxWorkers=2` runs test FILES in true
 * parallel worker processes against the SAME database, so an unscoped
 * delete here could wipe rows payment-settle.realdb.spec.ts (running
 * concurrently in the other worker) still depends on, or vice versa.
 * Cleanup failures are logged rather than silently swallowed.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const WEBHOOK_SECRET = "realdb-test-webhook-secret";
const PHONE_PREFIX = "+9055512";

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[reservations.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

function buildReservationsHarness(prisma: PrismaClient) {
  const registry = new PaymentProviderRegistry();
  const config = {
    get: (key: string) => ({ WEBHOOK_SECRET, PAYMENT_PROVIDER: "mock" })[key],
  } as unknown as ConfigService;
  const mockProvider = new MockPaymentProvider(config, registry);
  mockProvider.onModuleInit();
  const facade = new PaymentsFacadeService(registry, config);
  const offerStock = new OfferStockService();
  const outbox = new OutboxService();
  const service = new ReservationsService(
    prisma as any,
    offerStock,
    facade,
    outbox,
  );
  return { service, mockProvider };
}

async function seedMerchantStoreTemplate(
  prisma: PrismaClient,
  priceCents: number,
) {
  const merchant = await prisma.merchant.create({
    data: {
      legalName: "Realdb Test Gida A.S.",
      tradeName: "Realdb Test Firin",
      taxId: `RDB${Date.now()}`,
      iban: "TR000006701000000000000002",
      // Explicit APPROVED — since [M1] the atomic claim
      // (OfferStockService.claim) requires the offer's owning merchant to
      // be APPROVED, so this suite's every service.create() call would
      // otherwise fail OFFER_UNAVAILABLE against the schema's DRAFT
      // default. Mirrors discovery-radius.realdb.spec.ts's identical
      // fixture-hygiene fix for the same reason on the read side.
      verificationStatus: "APPROVED",
    },
  });
  const store = await prisma.store.create({
    data: {
      merchantId: merchant.id,
      name: "Realdb Test Store",
      address: "Test Sk. No:2",
      district: "Kadikoy",
      city: "Istanbul",
      latitude: 40.99,
      longitude: 29.03,
    },
  });
  const bagTemplate = await createBagTemplate(prisma, store.id, priceCents);
  return { merchant, store, bagTemplate };
}

// Each test seeds its OWN BagTemplate (rather than sharing one across the
// describe block) specifically so seedOffer's (bagTemplateId, offerDate)
// pair can never collide with another test's offer, regardless of how
// close their pickupStartAt values land on the calendar.
async function createBagTemplate(
  prisma: PrismaClient,
  storeId: string,
  priceCents: number,
) {
  return prisma.bagTemplate.create({
    data: {
      storeId,
      title: "Realdb Test Bag",
      category: "BAKERY",
      allergenDisclaimer: "N/A",
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
      priceCents,
    },
  });
}

async function seedOffer(
  prisma: PrismaClient,
  bagTemplateId: string,
  storeId: string,
  qtyTotal: number,
  pickupStartAt: Date,
  pickupEndAt: Date,
) {
  return prisma.dailyOffer.create({
    data: {
      bagTemplateId,
      storeId,
      offerDate: new Date(pickupStartAt.toISOString().slice(0, 10)),
      qtyTotal,
      pickupStartAt,
      pickupEndAt,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
}

let userSeedCounter = 0;

async function seedUsers(prisma: PrismaClient, count: number) {
  const users = await Promise.all(
    Array.from({ length: count }, () => {
      const n = userSeedCounter++;
      return prisma.user.create({
        data: { phoneE164: `${PHONE_PREFIX}${n.toString().padStart(5, "0")}` },
      });
    }),
  );
  return users;
}

d("ReservationsService — real DB concurrency", () => {
  let prisma: PrismaClient;
  let merchantId: string;
  let storeId: string;
  let bagTemplateId: string;

  beforeAll(async () => {
    const url = new URL(TEST_DATABASE_URL!);
    // 50 genuinely parallel create() calls each open their own
    // $transaction connection — bump the pool well past Prisma's default
    // (num_cpus*2+1) so the race is limited by Postgres row-locking, not
    // by connection-pool queuing timing out the test.
    url.searchParams.set("connection_limit", "60");
    url.searchParams.set("pool_timeout", "30");
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

    const seeded = await seedMerchantStoreTemplate(prisma, 5000);
    merchantId = seeded.merchant.id;
    storeId = seeded.store.id;
    bagTemplateId = seeded.bagTemplate.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await safeCleanup("refund", () =>
      prisma.refund.deleteMany({
        where: { payment: { reservation: { storeId } } },
      }),
    );
    await safeCleanup("payment", () =>
      prisma.payment.deleteMany({ where: { reservation: { storeId } } }),
    );
    await safeCleanup("reservation", () =>
      prisma.reservation.deleteMany({ where: { storeId } }),
    );
    await safeCleanup("dailyOffer", () =>
      prisma.dailyOffer.deleteMany({ where: { storeId } }),
    );
    await safeCleanup("user", () =>
      prisma.user.deleteMany({
        where: { phoneE164: { startsWith: PHONE_PREFIX } },
      }),
    );
    // Some tests seed their own additional BagTemplate (see createBagTemplate
    // call sites below) — deleteMany by storeId sweeps all of them, not just
    // the one from beforeAll.
    await safeCleanup("bagTemplate", () =>
      prisma.bagTemplate.deleteMany({ where: { storeId } }),
    );
    await safeCleanup("store", () =>
      prisma.store.delete({ where: { id: storeId } }),
    );
    await safeCleanup("merchant", () =>
      prisma.merchant.delete({ where: { id: merchantId } }),
    );
    await prisma.$disconnect();
  });

  it("oversell race: 50 parallel create() calls against qtyTotal=5 leave EXACTLY 5 reservations, offer SOLD_OUT, the other 45 uniformly rejected", async () => {
    const { service } = buildReservationsHarness(prisma);
    const pickupStartAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const pickupEndAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const offer = await seedOffer(
      prisma,
      bagTemplateId,
      storeId,
      5,
      pickupStartAt,
      pickupEndAt,
    );
    const users = await seedUsers(prisma, 50);

    const results = await Promise.allSettled(
      users.map((u) => service.create(u.id, offer.id, 1)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(5);
    expect(rejected).toHaveLength(45);
    for (const r of rejected) {
      expect(r.reason?.response?.errorCode).toBe("OFFER_UNAVAILABLE");
    }

    const reservationCount = await prisma.reservation.count({
      where: { offerId: offer.id },
    });
    expect(reservationCount).toBe(5);

    const finalOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(finalOffer.qtyReserved).toBe(5);
    expect(finalOffer.status).toBe("SOLD_OUT");
    // The DB CHECK (daily_offers_qty_reserved_within_total) would have
    // aborted any transaction that tried to push qtyReserved past
    // qtyTotal — every winner above committed cleanly, so this also
    // proves the CHECK was never tripped.
    expect(finalOffer.qtyReserved).toBeLessThanOrEqual(finalOffer.qtyTotal);
  }, 30_000);

  it("cancel restores stock: a SOLD_OUT offer + one cancel decrements qtyReserved and flips back to PUBLISHED; refund is called for a CONFIRMED reservation", async () => {
    const { service, mockProvider } = buildReservationsHarness(prisma);
    const pickupStartAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const pickupEndAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const bagTemplate = await createBagTemplate(prisma, storeId, 5000);
    const offer = await seedOffer(
      prisma,
      bagTemplate.id,
      storeId,
      3,
      pickupStartAt,
      pickupEndAt,
    );
    const [user] = await seedUsers(prisma, 1);

    const created = await service.create(user.id, offer.id, 3); // fills it exactly
    const filled = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(filled.status).toBe("SOLD_OUT");
    expect(filled.qtyReserved).toBe(3);

    // Simulate the reservation having been paid (webhook/sweeper settle is
    // covered by payment-settle.realdb.spec.ts — here we only need a
    // CONFIRMED reservation to exercise cancel's refund branch).
    await prisma.reservation.update({
      where: { id: created.reservationId },
      data: { status: "CONFIRMED" },
    });
    await prisma.payment.update({
      where: { merchantOid: created.payment.merchantOid },
      data: { status: "PAID", paidAt: new Date() },
    });

    const result = await service.cancel(user.id, created.reservationId);
    expect(result.status).toBe("CANCELLED_BY_USER");

    const releasedOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(releasedOffer.qtyReserved).toBe(0);
    expect(releasedOffer.status).toBe("PUBLISHED");

    expect(mockProvider.getRefundLog()).toContainEqual({
      merchantOid: created.payment.merchantOid,
      amountCents: created.totalCents,
      refundRef: expect.stringContaining("mock-refund-"),
    });
    const refundRow = await prisma.refund.findFirstOrThrow({
      where: { payment: { merchantOid: created.payment.merchantOid } },
    });
    expect(refundRow.status).toBe("DONE");
    expect(refundRow.amountCents).toBe(created.totalCents);
  }, 15_000);

  it("redeem idempotency: two parallel redeem() calls for the same reservation increment qtyRedeemed exactly once", async () => {
    const { service } = buildReservationsHarness(prisma);
    const now = Date.now();
    const bagTemplate = await createBagTemplate(prisma, storeId, 5000);
    const offer = await seedOffer(
      prisma,
      bagTemplate.id,
      storeId,
      2,
      new Date(now - 30 * 60 * 1000), // pickup window already open
      new Date(now + 30 * 60 * 1000),
    );
    const [user] = await seedUsers(prisma, 1);

    const created = await service.create(user.id, offer.id, 2);
    await prisma.reservation.update({
      where: { id: created.reservationId },
      data: { status: "CONFIRMED" },
    });

    const results = await Promise.allSettled([
      service.redeem(
        "realdb-merchant-user-1",
        merchantId,
        created.reservationId,
      ),
      service.redeem(
        "realdb-merchant-user-1",
        merchantId,
        created.reservationId,
      ),
    ]);

    // Idempotent by design — BOTH calls resolve successfully, neither
    // throws (see reservations.service.ts's redeem()).
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const finalReservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservationId },
    });
    expect(finalReservation.status).toBe("REDEEMED");

    const finalOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(finalOffer.qtyRedeemed).toBe(2); // reservation.qty, exactly once — not 4
  }, 15_000);

  it("[I3] a reservation-code collision against a REAL unique constraint retries the whole transaction (fresh stock claim included) and succeeds", async () => {
    const { service } = buildReservationsHarness(prisma);
    const pickupStartAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const pickupEndAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    const bagTemplateA = await createBagTemplate(prisma, storeId, 5000);
    const offerA = await seedOffer(
      prisma,
      bagTemplateA.id,
      storeId,
      5,
      pickupStartAt,
      pickupEndAt,
    );
    const [userA] = await seedUsers(prisma, 1);
    // Seed a real reservation first to get a genuine `code` value already
    // present in the DB — this is what the second create() below will
    // collide against.
    const first = await service.create(userA.id, offerA.id, 1);
    const collidingCode = first.code;

    const bagTemplateB = await createBagTemplate(prisma, storeId, 5000);
    const offerB = await seedOffer(
      prisma,
      bagTemplateB.id,
      storeId,
      5,
      pickupStartAt,
      pickupEndAt,
    );
    const [userB] = await seedUsers(prisma, 1);

    // Force the FIRST code-generation attempt for the second reservation
    // to collide with the first reservation's real code — a genuine
    // unique-constraint violation against real Postgres, not a mock.
    // Every subsequent call falls through to the real random generator.
    const codeSpy = jest
      .spyOn(reservationCodeUtil, "generateReservationCode")
      .mockReturnValueOnce(collidingCode);

    try {
      const second = await service.create(userB.id, offerB.id, 1);

      expect(second.reservationId).not.toBe(first.reservationId);
      expect(second.code).not.toBe(collidingCode);
      // Proves the WHOLE transaction retried, not just the failed INSERT
      // (the pre-fix version would have thrown Postgres error 25P02 on a
      // same-transaction retry — see reservations.service.ts's
      // createReservationWithRetry doc comment) — offerB's stock reflects
      // exactly one successful claim, not a half-applied one from the
      // aborted first attempt.
      const finalOfferB = await prisma.dailyOffer.findUniqueOrThrow({
        where: { id: offerB.id },
      });
      expect(finalOfferB.qtyReserved).toBe(1);
      expect(codeSpy).toHaveBeenCalledTimes(2);
    } finally {
      codeSpy.mockRestore();
    }
  }, 15_000);

  it("[M1] a SUSPENDED merchant's and a DRAFT merchant's PUBLISHED offer cannot be reserved even with a valid offerId — the same uniform OFFER_UNAVAILABLE error as sold-out, no stock claimed; an APPROVED merchant's offer still can be", async () => {
    const { service } = buildReservationsHarness(prisma);
    const pickupStartAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const pickupEndAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    // Self-contained fixtures (own merchants/stores/offers, own cleanup at
    // the end of this test) — the whole point is a merchant whose
    // verificationStatus is NOT APPROVED, unlike the describe-level
    // fixture used by every other test in this file.
    const suspendedMerchant = await prisma.merchant.create({
      data: {
        legalName: "Suspended Merchant Reservations Realdb Test",
        tradeName: "Suspended Merchant Reservations Realdb Test",
        taxId: `RESVS${Date.now()}`.slice(0, 10),
        iban: "TR330006100519786457841326",
        verificationStatus: "SUSPENDED",
      },
    });
    const draftMerchant = await prisma.merchant.create({
      data: {
        legalName: "Draft Merchant Reservations Realdb Test",
        tradeName: "Draft Merchant Reservations Realdb Test",
        taxId: `RESVD${Date.now()}`.slice(0, 10),
        iban: "TR330006100519786457841326",
        // verificationStatus defaults to DRAFT — never approved.
      },
    });

    const suspendedStore = await prisma.store.create({
      data: {
        merchantId: suspendedMerchant.id,
        name: "Suspended Merchant Store",
        address: "Test Sk. No:5",
        district: "Kadikoy",
        city: "Istanbul",
        latitude: 40.96,
        longitude: 29.0,
      },
    });
    const draftStore = await prisma.store.create({
      data: {
        merchantId: draftMerchant.id,
        name: "Draft Merchant Store",
        address: "Test Sk. No:6",
        district: "Kadikoy",
        city: "Istanbul",
        latitude: 40.95,
        longitude: 29.0,
      },
    });

    const suspendedBagTemplate = await createBagTemplate(
      prisma,
      suspendedStore.id,
      5000,
    );
    const draftBagTemplate = await createBagTemplate(
      prisma,
      draftStore.id,
      5000,
    );

    const suspendedOffer = await seedOffer(
      prisma,
      suspendedBagTemplate.id,
      suspendedStore.id,
      5,
      pickupStartAt,
      pickupEndAt,
    );
    const draftOffer = await seedOffer(
      prisma,
      draftBagTemplate.id,
      draftStore.id,
      5,
      pickupStartAt,
      pickupEndAt,
    );
    // A fresh APPROVED-merchant offer as the positive control, proving
    // this isn't a blanket regression — only non-APPROVED merchants are
    // blocked.
    const approvedBagTemplate = await createBagTemplate(prisma, storeId, 5000);
    const approvedOffer = await seedOffer(
      prisma,
      approvedBagTemplate.id,
      storeId,
      5,
      pickupStartAt,
      pickupEndAt,
    );

    const [userSuspended, userDraft, userApproved] = await seedUsers(prisma, 3);

    try {
      await expect(
        service.create(userSuspended.id, suspendedOffer.id, 1),
      ).rejects.toMatchObject({
        response: { errorCode: "OFFER_UNAVAILABLE" },
      });
      await expect(
        service.create(userDraft.id, draftOffer.id, 1),
      ).rejects.toMatchObject({
        response: { errorCode: "OFFER_UNAVAILABLE" },
      });

      // No stock was claimed for either blocked offer — the claim's WHERE
      // clause matched 0 rows, it never even touched qtyReserved.
      const finalSuspendedOffer = await prisma.dailyOffer.findUniqueOrThrow({
        where: { id: suspendedOffer.id },
      });
      expect(finalSuspendedOffer.qtyReserved).toBe(0);
      const finalDraftOffer = await prisma.dailyOffer.findUniqueOrThrow({
        where: { id: draftOffer.id },
      });
      expect(finalDraftOffer.qtyReserved).toBe(0);

      // Positive control: an APPROVED merchant's otherwise-identical offer
      // reserves normally.
      const approvedResult = await service.create(
        userApproved.id,
        approvedOffer.id,
        1,
      );
      expect(approvedResult.reservationId).toBeDefined();
      const finalApprovedOffer = await prisma.dailyOffer.findUniqueOrThrow({
        where: { id: approvedOffer.id },
      });
      expect(finalApprovedOffer.qtyReserved).toBe(1);
    } finally {
      await safeCleanup("dailyOffer (M1 fixture)", () =>
        prisma.dailyOffer.deleteMany({
          where: { storeId: { in: [suspendedStore.id, draftStore.id] } },
        }),
      );
      await safeCleanup("bagTemplate (M1 fixture)", () =>
        prisma.bagTemplate.deleteMany({
          where: { storeId: { in: [suspendedStore.id, draftStore.id] } },
        }),
      );
      await safeCleanup("store (M1 fixture)", () =>
        prisma.store.deleteMany({
          where: { id: { in: [suspendedStore.id, draftStore.id] } },
        }),
      );
      await safeCleanup("merchant (M1 fixture)", () =>
        prisma.merchant.deleteMany({
          where: { id: { in: [suspendedMerchant.id, draftMerchant.id] } },
        }),
      );
    }
  }, 15_000);
});

/**
 * [Merchant pickup list] listForMerchant's WHOLE reason to exist is
 * "a merchant may see only their own reservations" — the strongest proof
 * that's actually true is two REAL merchants, two real stores, two real
 * reservations, and asserting each merchant's call structurally never
 * returns the other's row (not "filtered client-side and we didn't
 * notice," an actual empty result from the query itself). Runs against
 * its own pair of merchants/stores, independent of the shared fixture
 * above.
 */
d(
  "ReservationsService.listForMerchant — real DB cross-merchant isolation",
  () => {
    let prisma: PrismaClient;
    let merchantA: Awaited<ReturnType<typeof seedMerchantStoreTemplate>>;
    let merchantB: Awaited<ReturnType<typeof seedMerchantStoreTemplate>>;

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL! } },
      });
      merchantA = await seedMerchantStoreTemplate(prisma, 5000);
      merchantB = await seedMerchantStoreTemplate(prisma, 5000);
    });

    afterAll(async () => {
      if (!prisma) return;
      const storeIds = [merchantA.store.id, merchantB.store.id];
      await safeCleanup("reservation", () =>
        prisma.reservation.deleteMany({ where: { storeId: { in: storeIds } } }),
      );
      await safeCleanup("dailyOffer", () =>
        prisma.dailyOffer.deleteMany({ where: { storeId: { in: storeIds } } }),
      );
      await safeCleanup("user", () =>
        prisma.user.deleteMany({
          where: { phoneE164: { startsWith: PHONE_PREFIX } },
        }),
      );
      await safeCleanup("bagTemplate", () =>
        prisma.bagTemplate.deleteMany({ where: { storeId: { in: storeIds } } }),
      );
      await safeCleanup("store", () =>
        prisma.store.deleteMany({ where: { id: { in: storeIds } } }),
      );
      await safeCleanup("merchant", () =>
        prisma.merchant.deleteMany({
          where: { id: { in: [merchantA.merchant.id, merchantB.merchant.id] } },
        }),
      );
      await prisma.$disconnect();
    });

    it("[Security] a second merchant's reservations are structurally invisible — scoped in the query, not a post-filter", async () => {
      const { service } = buildReservationsHarness(prisma);
      const pickupStartAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const pickupEndAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const dateKey = pickupStartAt.toISOString().slice(0, 10);

      const offerA = await seedOffer(
        prisma,
        merchantA.bagTemplate.id,
        merchantA.store.id,
        5,
        pickupStartAt,
        pickupEndAt,
      );
      const offerB = await seedOffer(
        prisma,
        merchantB.bagTemplate.id,
        merchantB.store.id,
        5,
        pickupStartAt,
        pickupEndAt,
      );
      const [userA] = await seedUsers(prisma, 1);
      const [userB] = await seedUsers(prisma, 1);
      // Exercises firstNameOnly() at the same time: userA gets a
      // multi-word name (only the first token should come back), userB
      // stays nameless (the common OTP-signup case) to prove that path
      // returns null rather than throwing.
      await prisma.user.update({
        where: { id: userA.id },
        data: { name: "Ayşe Yılmaz" },
      });

      const reservationA = await prisma.reservation.create({
        data: {
          code: `ISOA${Date.now()}`.slice(0, 12),
          userId: userA.id,
          offerId: offerA.id,
          storeId: merchantA.store.id,
          qty: 1,
          unitPriceCents: 5000,
          totalCents: 5000,
          status: "CONFIRMED",
          cancelDeadlineAt: new Date(
            pickupStartAt.getTime() - 2 * 60 * 60 * 1000,
          ),
        },
      });
      const reservationB = await prisma.reservation.create({
        data: {
          code: `ISOB${Date.now()}`.slice(0, 12),
          userId: userB.id,
          offerId: offerB.id,
          storeId: merchantB.store.id,
          qty: 2,
          unitPriceCents: 5000,
          totalCents: 10000,
          status: "CONFIRMED",
          cancelDeadlineAt: new Date(
            pickupStartAt.getTime() - 2 * 60 * 60 * 1000,
          ),
        },
      });

      const resultA = await service.listForMerchant(merchantA.merchant.id, {
        date: dateKey,
        page: 1,
        pageSize: 20,
      });
      const resultB = await service.listForMerchant(merchantB.merchant.id, {
        date: dateKey,
        page: 1,
        pageSize: 20,
      });

      expect(resultA.items.map((i) => i.id)).toEqual([reservationA.id]);
      expect(resultA.items.map((i) => i.id)).not.toContain(reservationB.id);
      expect(resultA.total).toBe(1);
      expect(resultA.items[0].customerFirstName).toBe("Ayşe");
      expect(resultA.items[0].storeId).toBe(merchantA.store.id);

      expect(resultB.items.map((i) => i.id)).toEqual([reservationB.id]);
      expect(resultB.items.map((i) => i.id)).not.toContain(reservationA.id);
      expect(resultB.total).toBe(1);
      expect(resultB.items[0].customerFirstName).toBeNull();
      expect(resultB.items[0].storeId).toBe(merchantB.store.id);
    });

    it("filters by storeId, offerId, and status together", async () => {
      const { service } = buildReservationsHarness(prisma);
      const pickupStartAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const pickupEndAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const dateKey = pickupStartAt.toISOString().slice(0, 10);

      // Two FRESH bag templates, not merchantA.bagTemplate.id — DailyOffer
      // has a real @@unique([bagTemplateId, offerDate]) constraint, and the
      // isolation test above already used merchantA.bagTemplate.id for an
      // offer on this same calendar day. Mirrors this file's existing
      // convention (see createBagTemplate's own call sites elsewhere in
      // this file): each test seeds its own template(s) so same-day offers
      // can never collide across tests.
      const bagTemplate = await createBagTemplate(
        prisma,
        merchantA.store.id,
        5000,
      );
      const otherBagTemplate = await createBagTemplate(
        prisma,
        merchantA.store.id,
        5000,
      );
      const offer = await seedOffer(
        prisma,
        bagTemplate.id,
        merchantA.store.id,
        5,
        pickupStartAt,
        pickupEndAt,
      );
      const otherOffer = await seedOffer(
        prisma,
        otherBagTemplate.id,
        merchantA.store.id,
        5,
        pickupStartAt,
        pickupEndAt,
      );
      const [confirmedUser, redeemedUser] = await seedUsers(prisma, 2);

      const confirmed = await prisma.reservation.create({
        data: {
          code: `ISOC${Date.now()}`.slice(0, 12),
          userId: confirmedUser.id,
          offerId: offer.id,
          storeId: merchantA.store.id,
          qty: 1,
          unitPriceCents: 5000,
          totalCents: 5000,
          status: "CONFIRMED",
          cancelDeadlineAt: new Date(
            pickupStartAt.getTime() - 2 * 60 * 60 * 1000,
          ),
        },
      });
      await prisma.reservation.create({
        data: {
          code: `ISOR${Date.now()}`.slice(0, 12),
          userId: redeemedUser.id,
          offerId: otherOffer.id,
          storeId: merchantA.store.id,
          qty: 1,
          unitPriceCents: 5000,
          totalCents: 5000,
          status: "REDEEMED",
          redeemedAt: new Date(),
          cancelDeadlineAt: new Date(
            pickupStartAt.getTime() - 2 * 60 * 60 * 1000,
          ),
        },
      });

      const result = await service.listForMerchant(merchantA.merchant.id, {
        date: dateKey,
        offerId: offer.id,
        status: ["CONFIRMED"],
        page: 1,
        pageSize: 20,
      });

      expect(result.items.map((i) => i.id)).toEqual([confirmed.id]);
      expect(result.total).toBe(1);

      await safeCleanup("reservation (filter test)", () =>
        prisma.reservation.deleteMany({
          where: { offerId: { in: [offer.id, otherOffer.id] } },
        }),
      );
      await safeCleanup("dailyOffer (filter test)", () =>
        prisma.dailyOffer.deleteMany({
          where: { id: { in: [offer.id, otherOffer.id] } },
        }),
      );
    });
  },
);
