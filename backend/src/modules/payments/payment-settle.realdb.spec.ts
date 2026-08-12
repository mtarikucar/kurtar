import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { ReservationsService } from "../reservations/reservations.service";
import { OfferStockService } from "../reservations/offer-stock.service";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { PaymentSettleService } from "./payment-settle.service";
import { ParsedWebhookEvent } from "../payments-core/payment-provider.interface";

/**
 * Real-DB concurrency proof for the webhook settle path — the other three
 * of Task 4's six race specs (webhook idempotency, amount mismatch,
 * sweeper-vs-webhook). See reservations.realdb.spec.ts for the
 * oversell/cancel/redeem side of the same state machine and for the
 * shared harness rationale (this file duplicates a small amount of setup
 * rather than sharing a test-utils module, matching this repo's existing
 * realdb spec convention of self-contained files).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const WEBHOOK_SECRET = "realdb-test-webhook-secret";

function buildHarness(prisma: PrismaClient) {
  const registry = new PaymentProviderRegistry();
  const config = {
    get: (key: string) => ({ WEBHOOK_SECRET, PAYMENT_PROVIDER: "mock" })[key],
  } as unknown as ConfigService;
  const mockProvider = new MockPaymentProvider(config, registry);
  mockProvider.onModuleInit();
  const facade = new PaymentsFacadeService(registry, config);
  const offerStock = new OfferStockService();
  const reservations = new ReservationsService(
    prisma as any,
    offerStock,
    facade,
  );
  const settle = new PaymentSettleService(prisma as any, offerStock, facade);
  return { reservations, settle, mockProvider };
}

async function seedMerchantStoreTemplate(
  prisma: PrismaClient,
  priceCents: number,
) {
  const merchant = await prisma.merchant.create({
    data: {
      legalName: "Realdb Webhook Test A.S.",
      tradeName: "Realdb Webhook Test Firin",
      taxId: `RDBW${Date.now()}`,
      iban: "TR000006701000000000000003",
    },
  });
  const store = await prisma.store.create({
    data: {
      merchantId: merchant.id,
      name: "Realdb Webhook Test Store",
      address: "Test Sk. No:3",
      district: "Kadikoy",
      city: "Istanbul",
      latitude: 40.99,
      longitude: 29.03,
    },
  });
  const bagTemplate = await prisma.bagTemplate.create({
    data: {
      storeId: store.id,
      title: "Realdb Webhook Test Bag",
      category: "BAKERY",
      allergenDisclaimer: "N/A",
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
      priceCents,
    },
  });
  return { merchant, store, bagTemplate };
}

let seedCounter = 0;

// Each call seeds its OWN BagTemplate (rather than sharing one across the
// describe block) so seedOffer's (bagTemplateId, offerDate) unique pair
// never collides across the 3 tests below — mirrors
// reservations.realdb.spec.ts's identical fix for the same reason.
async function seedOfferAndReservation(
  prisma: PrismaClient,
  reservations: ReservationsService,
  storeId: string,
) {
  const n = seedCounter++;
  const user = await prisma.user.create({
    data: { phoneE164: `+9055513${n.toString().padStart(5, "0")}` },
  });
  const bagTemplate = await prisma.bagTemplate.create({
    data: {
      storeId,
      title: "Realdb Webhook Test Bag",
      category: "BAKERY",
      allergenDisclaimer: "N/A",
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
      priceCents: 5000,
    },
  });
  const pickupStartAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const offer = await prisma.dailyOffer.create({
    data: {
      bagTemplateId: bagTemplate.id,
      storeId,
      offerDate: new Date(pickupStartAt.toISOString().slice(0, 10)),
      qtyTotal: 5,
      pickupStartAt,
      pickupEndAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  const created = await reservations.create(user.id, offer.id, 1);
  return { user, offer, bagTemplate, created };
}

d("PaymentSettleService — real DB concurrency", () => {
  let prisma: PrismaClient;
  let merchantId: string;
  let storeId: string;

  beforeAll(async () => {
    const url = new URL(TEST_DATABASE_URL!);
    url.searchParams.set("connection_limit", "20");
    url.searchParams.set("pool_timeout", "30");
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

    const seeded = await seedMerchantStoreTemplate(prisma, 5000);
    merchantId = seeded.merchant.id;
    storeId = seeded.store.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.webhookEventLog.deleteMany({}).catch(() => {});
    await prisma.refund.deleteMany({}).catch(() => {});
    await prisma.payment
      .deleteMany({ where: { reservation: { storeId } } })
      .catch(() => {});
    await prisma.reservation.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.dailyOffer.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { phoneE164: { startsWith: "+90555" } } })
      .catch(() => {});
    // seedMerchantStoreTemplate's own BagTemplate plus one per
    // seedOfferAndReservation() call — sweep them all by storeId.
    await prisma.bagTemplate.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("webhook idempotency: the SAME success payload delivered 3x in parallel settles exactly once", async () => {
    const { reservations, settle } = buildHarness(prisma);
    const { offer, created } = await seedOfferAndReservation(
      prisma,
      reservations,
      storeId,
    );

    const event: ParsedWebhookEvent = {
      merchantOid: created.payment.merchantOid,
      status: "success",
      totalCents: created.totalCents,
      externalEventId: `evt-idempotency-${created.reservationId}`,
    };

    const outcomes = await Promise.all([
      settle.settle(event),
      settle.settle(event),
      settle.settle(event),
    ]);

    expect(outcomes.filter((o) => o === "confirmed")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "duplicate")).toHaveLength(2);

    const logCount = await prisma.webhookEventLog.count({
      where: { externalEventId: event.externalEventId },
    });
    expect(logCount).toBe(1);

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservationId },
    });
    expect(reservation.status).toBe("CONFIRMED");

    // Stock was claimed once at create() and is untouched by a successful
    // settle — confirm it wasn't double-released or otherwise disturbed
    // by the 3x delivery.
    const finalOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(finalOffer.qtyReserved).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it("amount mismatch: a paid webhook reporting totalCents-1 does not settle; Payment stays INTENT", async () => {
    const { reservations, settle } = buildHarness(prisma);
    const { created } = await seedOfferAndReservation(
      prisma,
      reservations,
      storeId,
    );

    const outcome = await settle.settle({
      merchantOid: created.payment.merchantOid,
      status: "success",
      totalCents: created.totalCents - 1,
      externalEventId: `evt-mismatch-${created.reservationId}`,
    });

    expect(outcome).toBe("amount_mismatch");

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { merchantOid: created.payment.merchantOid },
    });
    expect(payment.status).toBe("INTENT");

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservationId },
    });
    expect(reservation.status).toBe("PENDING_PAYMENT");
  }, 15_000);

  it("sweeper vs webhook race: a late success settle racing a sweeper-style expiry settle resolves to exactly one effect, never both", async () => {
    const { reservations, settle } = buildHarness(prisma);
    const { offer, created } = await seedOfferAndReservation(
      prisma,
      reservations,
      storeId,
    );
    const offerBefore = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });

    const successEvent: ParsedWebhookEvent = {
      merchantOid: created.payment.merchantOid,
      status: "success",
      totalCents: created.totalCents,
      externalEventId: `evt-webhook-${created.reservationId}`,
    };
    // The sweeper synthesizes exactly this shape (payments-sweeper.service.ts)
    // for a payment it judged stale/unpaid — different externalEventId, same
    // merchantOid, opposite outcome.
    const sweepEvent: ParsedWebhookEvent = {
      merchantOid: created.payment.merchantOid,
      status: "failed",
      totalCents: created.totalCents,
      externalEventId: `evt-sweep-${created.reservationId}`,
    };

    const [webhookOutcome, sweepOutcome] = await Promise.all([
      settle.settle(successEvent),
      settle.settle(sweepEvent),
    ]);

    // Exactly one call produced a terminal effect; the other lost the
    // race and no-opped.
    const outcomes = [webhookOutcome, sweepOutcome];
    const terminalOutcomes = outcomes.filter(
      (o) => o === "confirmed" || o === "expired",
    );
    const noopOutcomes = outcomes.filter((o) => o === "already_terminal");
    expect(terminalOutcomes).toHaveLength(1);
    expect(noopOutcomes).toHaveLength(1);

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservationId },
    });
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { merchantOid: created.payment.merchantOid },
    });
    const finalOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });

    if (terminalOutcomes[0] === "confirmed") {
      // The success settle won the race.
      expect(reservation.status).toBe("CONFIRMED");
      expect(payment.status).toBe("PAID");
      // Stock was never released — still exactly what create() claimed.
      expect(finalOffer.qtyReserved).toBe(offerBefore.qtyReserved);
    } else {
      // The (simulated) sweeper's expiry won the race.
      expect(reservation.status).toBe("EXPIRED");
      expect(payment.status).toBe("FAILED");
      // Stock was released back — never both confirmed AND released.
      expect(finalOffer.qtyReserved).toBe(
        offerBefore.qtyReserved - reservation.qty,
      );
    }
  }, 15_000);
});
