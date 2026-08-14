import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { OfferStockService } from "../reservations/offer-stock.service";
import { ReservationsService } from "../reservations/reservations.service";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { OffersService } from "../offers/offers.service";
import { TokenService } from "../auth/services/token.service";
import { MerchantsService } from "./merchants.service";
import { OutboxService } from "../outbox/outbox.service";

/**
 * Real-DB proof of the suspend kill-switch (§1 of the Task 5 brief): a
 * merchant with 2 active offers (each with a live CONFIRMED reservation)
 * gets suspended, and BOTH offers are cancelled — through
 * OffersService.cancelAllActiveForMerchant, which reuses the exact same
 * OffersService.cancel() → ReservationsService.cancelAllForOffer/refundMany
 * chain the merchant-facing cancel endpoint uses (see
 * offer-cancel-fanout.realdb.spec.ts for that path's own direct coverage)
 * — nothing here duplicates the fan-out logic. Only runs when
 * TEST_DATABASE_URL is set (Task 2/3/4's realdb gate pattern).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const WEBHOOK_SECRET = "realdb-suspend-test-webhook-secret";
const PHONE_PREFIX = "+9055515";

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
  // TokenService is a required MerchantsService constructor dependency but
  // this suite never signs up/logs in through MerchantsService — only
  // exercises adminSuspend, which never touches it.
  const tokenService = {} as unknown as TokenService;
  const merchants = new MerchantsService(
    prisma as any,
    tokenService,
    offers,
    outbox,
  );
  return { reservations, merchants };
}

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[merchant-suspend-killswitch.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

async function seedApprovedMerchantWithStore(prisma: PrismaClient) {
  const merchant = await prisma.merchant.create({
    data: {
      legalName: "Suspend Killswitch Realdb Test A.Ş.",
      tradeName: "Suspend Killswitch Realdb Test Fırın",
      taxId: `SUSP${Date.now()}`.slice(0, 10),
      iban: "TR330006100519786457841326",
      verificationStatus: "APPROVED",
    },
  });
  const store = await prisma.store.create({
    data: {
      merchantId: merchant.id,
      name: "Suspend Killswitch Realdb Test Store",
      address: "Test Sk. No:5",
      district: "Kadıköy",
      city: "İstanbul",
      latitude: 40.99,
      longitude: 29.03,
    },
  });
  return { merchant, store };
}

async function createBagTemplate(prisma: PrismaClient, storeId: string) {
  return prisma.bagTemplate.create({
    data: {
      storeId,
      title: "Suspend Killswitch Realdb Test Bag",
      category: "BAKERY",
      allergenDisclaimer: "N/A",
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
      priceCents: 5900,
    },
  });
}

async function seedOffer(
  prisma: PrismaClient,
  bagTemplateId: string,
  storeId: string,
) {
  const pickupStartAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const pickupEndAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return prisma.dailyOffer.create({
    data: {
      bagTemplateId,
      storeId,
      offerDate: new Date(pickupStartAt.toISOString().slice(0, 10)),
      qtyTotal: 5,
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

d("MerchantsService.adminSuspend — real DB kill-switch", () => {
  let prisma: PrismaClient;
  let merchantId: string;
  let storeId: string;
  const offerIds: string[] = [];

  beforeAll(async () => {
    const url = new URL(TEST_DATABASE_URL!);
    url.searchParams.set("connection_limit", "20");
    url.searchParams.set("pool_timeout", "30");
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

    const seeded = await seedApprovedMerchantWithStore(prisma);
    merchantId = seeded.merchant.id;
    storeId = seeded.store.id;
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
    // [Fix round 2] The merchant-email leg was split out into its own
    // event type (offer.cancelled.merchant-email.v1) — see event-types.ts.
    await safeCleanup("outboxEvent", () =>
      prisma.outboxEvent.deleteMany({
        where: {
          type: "offer.cancelled.merchant-email.v1",
          idempotencyKey: {
            in: offerIds.map((id) => `offer-cancelled-merchant-email:${id}`),
          },
        },
      }),
    );
    await safeCleanup("merchantVerificationEvent", () =>
      prisma.merchantVerificationEvent.deleteMany({ where: { merchantId } }),
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

  it("merchant with 2 active offers: suspend cancels BOTH via the offers service, and the reservation fan-out ran on each", async () => {
    const { reservations, merchants } = buildHarness(prisma);

    const bagTemplateA = await createBagTemplate(prisma, storeId);
    const bagTemplateB = await createBagTemplate(prisma, storeId);
    const offerA = await seedOffer(prisma, bagTemplateA.id, storeId);
    const offerB = await seedOffer(prisma, bagTemplateB.id, storeId);
    offerIds.push(offerA.id, offerB.id);
    const [userA, userB] = await seedUsers(prisma, 2);

    const rA = await reservations.create(userA.id, offerA.id, 1);
    const rB = await reservations.create(userB.id, offerB.id, 1);
    await confirmAndPay(prisma, rA.reservationId, rA.payment.merchantOid);
    await confirmAndPay(prisma, rB.reservationId, rB.payment.merchantOid);

    const result = await merchants.adminSuspend(
      "admin-1",
      merchantId,
      "policy violation",
    );

    expect(result.status).toBe("SUSPENDED");
    expect(result.offersCancelled).toBe(2);

    const merchant = await prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
    });
    expect(merchant.verificationStatus).toBe("SUSPENDED");

    const [finalOfferA, finalOfferB] = await Promise.all([
      prisma.dailyOffer.findUniqueOrThrow({ where: { id: offerA.id } }),
      prisma.dailyOffer.findUniqueOrThrow({ where: { id: offerB.id } }),
    ]);
    expect(finalOfferA.status).toBe("CANCELLED");
    expect(finalOfferB.status).toBe("CANCELLED");
    expect(finalOfferA.qtyReserved).toBe(0);
    expect(finalOfferB.qtyReserved).toBe(0);

    const [finalRA, finalRB] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: rA.reservationId } }),
      prisma.reservation.findUniqueOrThrow({ where: { id: rB.reservationId } }),
    ]);
    expect(finalRA.status).toBe("CANCELLED_BY_MERCHANT");
    expect(finalRB.status).toBe("CANCELLED_BY_MERCHANT");

    const [pA, pB] = await Promise.all([
      prisma.payment.findUniqueOrThrow({
        where: { merchantOid: rA.payment.merchantOid },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { merchantOid: rB.payment.merchantOid },
      }),
    ]);
    expect(pA.status).toBe("REFUNDED");
    expect(pB.status).toBe("REFUNDED");

    // Suspend-triggered refunds are tagged ADMIN, not MERCHANT_CANCEL —
    // the acting party differs even though the mechanics are identical
    // (see reservations.service.ts's OfferCancelReason).
    const refunds = await prisma.refund.findMany({
      where: { paymentId: { in: [pA.id, pB.id] } },
    });
    expect(refunds).toHaveLength(2);
    for (const refund of refunds) {
      expect(refund.status).toBe("DONE");
      expect(refund.reason).toBe("ADMIN");
      expect(refund.requestedByType).toBe("ADMIN");
    }

    const verificationEvent =
      await prisma.merchantVerificationEvent.findFirstOrThrow({
        where: { merchantId, toStatus: "SUSPENDED" },
      });
    expect(verificationEvent.fromStatus).toBe("APPROVED");
    expect(verificationEvent.actorAdminId).toBe("admin-1");
    expect(verificationEvent.note).toBe("policy violation");

    const outboxRows = await prisma.outboxEvent.findMany({
      where: {
        type: "offer.cancelled.v1",
        idempotencyKey: {
          in: [offerA.id, offerB.id].map((id) => `offer-cancelled:${id}`),
        },
      },
    });
    expect(outboxRows).toHaveLength(2);
  }, 25_000);

  it("a merchant not currently APPROVED cannot be suspended", async () => {
    const { merchants } = buildHarness(prisma);
    const draftMerchant = await prisma.merchant.create({
      data: {
        legalName: "Draft Merchant Realdb Test",
        tradeName: "Draft Merchant Realdb Test",
        taxId: `SUSPD${Date.now()}`.slice(0, 10),
        iban: "TR330006100519786457841326",
        // verificationStatus defaults to DRAFT
      },
    });

    await expect(
      merchants.adminSuspend("admin-1", draftMerchant.id, undefined),
    ).rejects.toMatchObject({
      response: { errorCode: "MERCHANT_NOT_SUSPENDABLE" },
    });

    await safeCleanup("draftMerchant", () =>
      prisma.merchant.delete({ where: { id: draftMerchant.id } }),
    );
  }, 15_000);
});
