import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { OfferStockService } from "../reservations/offer-stock.service";
import { ReservationsService } from "../reservations/reservations.service";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { OffersService } from "./offers.service";
import { OutboxService } from "../outbox/outbox.service";

/**
 * Real-DB proof of the merchant-cancel reservation fan-out (§3 of the
 * Task 5 brief) — the scenario the brief's report explicitly asks for:
 * an offer with 2 CONFIRMED + 1 PENDING_PAYMENT reservation, cancelled
 * through OffersService.cancel() (the actual HTTP-level entry point, not
 * a lower-level primitive in isolation), proving the whole chain: offer
 * -> CANCELLED, PENDING_PAYMENT -> EXPIRED + stock released, CONFIRMED x2
 * -> CANCELLED_BY_MERCHANT + refunded, and the offer.cancelled.v1 outbox
 * row. The second test proves a forced provider-side refund failure on
 * ONE reservation never blocks the other's refund. Only runs when
 * TEST_DATABASE_URL is set (Task 2/3/4's realdb gate pattern).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const WEBHOOK_SECRET = "realdb-offer-cancel-test-webhook-secret";
const PHONE_PREFIX = "+9055514";

function buildHarness(prisma: PrismaClient) {
  const registry = new PaymentProviderRegistry();
  const config = {
    get: (key: string) => ({ WEBHOOK_SECRET, PAYMENT_PROVIDER: "mock" })[key],
  } as unknown as ConfigService;
  const mockProvider = new MockPaymentProvider(config, registry);
  mockProvider.onModuleInit();
  const facade = new PaymentsFacadeService(registry, config);
  const offerStock = new OfferStockService();
  const outbox = new OutboxService();
  const reservations = new ReservationsService(
    prisma as any,
    offerStock,
    facade,
    outbox,
  );
  const offers = new OffersService(prisma as any, reservations, outbox);
  return { reservations, offers, mockProvider };
}

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[offer-cancel-fanout.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

async function seedMerchantStoreTemplate(
  prisma: PrismaClient,
  priceCents: number,
) {
  const merchant = await prisma.merchant.create({
    data: {
      legalName: "Offer Cancel Realdb Test A.Ş.",
      tradeName: "Offer Cancel Realdb Test Fırın",
      taxId: `OCXL${Date.now()}`.slice(0, 10),
      iban: "TR330006100519786457841326",
      verificationStatus: "APPROVED",
    },
  });
  const store = await prisma.store.create({
    data: {
      merchantId: merchant.id,
      name: "Offer Cancel Realdb Test Store",
      address: "Test Sk. No:4",
      district: "Kadıköy",
      city: "İstanbul",
      latitude: 40.99,
      longitude: 29.03,
    },
  });
  const bagTemplate = await createBagTemplate(prisma, store.id, priceCents);
  return { merchant, store, bagTemplate };
}

// Each offer seeds its OWN BagTemplate so (bagTemplateId, offerDate) never
// collides across tests, mirroring reservations.realdb.spec.ts's identical
// fix for the same reason.
async function createBagTemplate(
  prisma: PrismaClient,
  storeId: string,
  priceCents: number,
) {
  return prisma.bagTemplate.create({
    data: {
      storeId,
      title: "Offer Cancel Realdb Test Bag",
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
) {
  const pickupStartAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const pickupEndAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
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
  return Promise.all(
    Array.from({ length: count }, () => {
      const n = userSeedCounter++;
      return prisma.user.create({
        data: { phoneE164: `${PHONE_PREFIX}${n.toString().padStart(5, "0")}` },
      });
    }),
  );
}

async function confirmAndPay(
  prisma: PrismaClient,
  reservationId: string,
  merchantOid: string,
) {
  await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: "CONFIRMED" },
  });
  await prisma.payment.update({
    where: { merchantOid },
    data: { status: "PAID", paidAt: new Date() },
  });
}

d("OffersService.cancel — real DB merchant-cancel fan-out", () => {
  let prisma: PrismaClient;
  let merchantId: string;
  let storeId: string;
  let bagTemplateId: string;
  const offerIds: string[] = [];

  beforeAll(async () => {
    const url = new URL(TEST_DATABASE_URL!);
    url.searchParams.set("connection_limit", "20");
    url.searchParams.set("pool_timeout", "30");
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

    const seeded = await seedMerchantStoreTemplate(prisma, 5900);
    merchantId = seeded.merchant.id;
    storeId = seeded.store.id;
    bagTemplateId = seeded.bagTemplate.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await safeCleanup("outboxEvent", () =>
      prisma.outboxEvent.deleteMany({
        where: {
          type: "offer.cancelled.v1",
          idempotencyKey: { in: offerIds.map((id) => `offer-cancelled:${id}`) },
        },
      }),
    );
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

  it("2 CONFIRMED + 1 PENDING_PAYMENT: cancel fans out to EXPIRED/CANCELLED_BY_MERCHANT, releases all stock, refunds both, writes the outbox row", async () => {
    const { reservations, offers } = buildHarness(prisma);
    const offer = await seedOffer(prisma, bagTemplateId, storeId, 5);
    offerIds.push(offer.id);
    const [u1, u2, u3] = await seedUsers(prisma, 3);

    const r1 = await reservations.create(u1.id, offer.id, 1);
    const r2 = await reservations.create(u2.id, offer.id, 1);
    const r3 = await reservations.create(u3.id, offer.id, 1); // left PENDING_PAYMENT

    await confirmAndPay(prisma, r1.reservationId, r1.payment.merchantOid);
    await confirmAndPay(prisma, r2.reservationId, r2.payment.merchantOid);

    const beforeOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(beforeOffer.qtyReserved).toBe(3);

    const result = await offers.cancel(merchantId, offer.id);

    expect(result.status).toBe("CANCELLED");
    expect(result.expiredCount).toBe(1);
    expect(result.cancelledCount).toBe(2);
    expect(result.refundResults).toHaveLength(2);
    expect(result.refundResults.every((r) => r.ok)).toBe(true);

    const finalOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(finalOffer.status).toBe("CANCELLED");
    // Stock released to correct count — all 3 claimed units given back
    // (1 expired + 2 cancelled), nothing left dangling.
    expect(finalOffer.qtyReserved).toBe(0);

    const [finalR1, finalR2, finalR3] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: r1.reservationId } }),
      prisma.reservation.findUniqueOrThrow({ where: { id: r2.reservationId } }),
      prisma.reservation.findUniqueOrThrow({ where: { id: r3.reservationId } }),
    ]);
    expect(finalR1.status).toBe("CANCELLED_BY_MERCHANT");
    expect(finalR2.status).toBe("CANCELLED_BY_MERCHANT");
    expect(finalR3.status).toBe("EXPIRED");

    const [p1, p2, p3] = await Promise.all([
      prisma.payment.findUniqueOrThrow({
        where: { merchantOid: r1.payment.merchantOid },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { merchantOid: r2.payment.merchantOid },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { merchantOid: r3.payment.merchantOid },
      }),
    ]);
    expect(p1.status).toBe("REFUNDED");
    expect(p2.status).toBe("REFUNDED");
    expect(p3.status).toBe("FAILED");

    const refunds = await prisma.refund.findMany({
      where: { paymentId: { in: [p1.id, p2.id] } },
    });
    expect(refunds).toHaveLength(2);
    for (const refund of refunds) {
      expect(refund.status).toBe("DONE");
      expect(refund.reason).toBe("MERCHANT_CANCEL");
      expect(refund.requestedByType).toBe("MERCHANT");
    }

    const outboxRows = await prisma.outboxEvent.findMany({
      where: {
        type: "offer.cancelled.v1",
        idempotencyKey: `offer-cancelled:${offer.id}`,
      },
    });
    expect(outboxRows).toHaveLength(1);
    const payload = outboxRows[0].payload as {
      offerId: string;
      storeId: string;
      expiredCount: number;
      cancelledCount: number;
      reason: string;
    };
    expect(payload.offerId).toBe(offer.id);
    expect(payload.storeId).toBe(storeId);
    expect(payload.expiredCount).toBe(1);
    expect(payload.cancelledCount).toBe(2);
    expect(payload.reason).toBe("MERCHANT_CANCEL");
  }, 20_000);

  it("a forced provider refund failure on ONE reservation does not abort the other's refund — both outcomes surfaced in the result", async () => {
    const { reservations, offers, mockProvider } = buildHarness(prisma);
    const bagTemplate2 = await createBagTemplate(prisma, storeId, 5900);
    const offer = await seedOffer(prisma, bagTemplate2.id, storeId, 5);
    offerIds.push(offer.id);
    const [u1, u2] = await seedUsers(prisma, 2);

    const r1 = await reservations.create(u1.id, offer.id, 1);
    const r2 = await reservations.create(u2.id, offer.id, 1);
    await confirmAndPay(prisma, r1.reservationId, r1.payment.merchantOid);
    await confirmAndPay(prisma, r2.reservationId, r2.payment.merchantOid);

    mockProvider.forceRefundFailure(r1.payment.merchantOid);

    const result = await offers.cancel(merchantId, offer.id);

    // The DB-level reservation transition is unaffected by the refund
    // outcome — both moved to CANCELLED_BY_MERCHANT regardless.
    expect(result.cancelledCount).toBe(2);
    expect(result.refundResults).toHaveLength(2);

    const outcomeFor = (reservationId: string) =>
      result.refundResults.find((r) => r.reservationId === reservationId)!;
    expect(outcomeFor(r1.reservationId).ok).toBe(false);
    expect(outcomeFor(r1.reservationId).error).toMatch(
      /Simulated refund failure/,
    );
    expect(outcomeFor(r2.reservationId).ok).toBe(true);
    expect(outcomeFor(r2.reservationId).refundRef).toEqual(
      expect.stringContaining("mock-refund-"),
    );

    const [p1, p2] = await Promise.all([
      prisma.payment.findUniqueOrThrow({
        where: { merchantOid: r1.payment.merchantOid },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { merchantOid: r2.payment.merchantOid },
      }),
    ]);
    // p1's refund call failed before any money moved — Payment stays PAID
    // (never flipped to REFUNDED), which is what makes a manual retry safe.
    expect(p1.status).toBe("PAID");
    expect(p2.status).toBe("REFUNDED");

    const refund1 = await prisma.refund.findFirstOrThrow({
      where: { paymentId: p1.id },
    });
    expect(refund1.status).toBe("FAILED");
    expect(refund1.reason).toBe("MERCHANT_CANCEL");
    const refund2 = await prisma.refund.findFirstOrThrow({
      where: { paymentId: p2.id },
    });
    expect(refund2.status).toBe("DONE");

    const [finalR1, finalR2] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: r1.reservationId } }),
      prisma.reservation.findUniqueOrThrow({ where: { id: r2.reservationId } }),
    ]);
    expect(finalR1.status).toBe("CANCELLED_BY_MERCHANT");
    expect(finalR2.status).toBe("CANCELLED_BY_MERCHANT");

    const finalOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(finalOffer.qtyReserved).toBe(0);
  }, 20_000);
});
