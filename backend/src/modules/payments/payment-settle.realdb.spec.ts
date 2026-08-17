import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { ReservationsService } from "../reservations/reservations.service";
import { OfferStockService } from "../reservations/offer-stock.service";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { PaymentSettleService } from "./payment-settle.service";
import { PaymentsSweeperService } from "./payments-sweeper.service";
import { PaymentsWebhookController } from "./payments-webhook.controller";
import { ParsedWebhookEvent } from "../payments-core/payment-provider.interface";
import { OutboxService } from "../outbox/outbox.service";

/**
 * Real-DB concurrency proof for the webhook settle path — the other three
 * of Task 4's six race specs (webhook idempotency, amount mismatch,
 * sweeper-vs-webhook). See reservations.realdb.spec.ts for the
 * oversell/cancel/redeem side of the same state machine and for the
 * shared harness rationale (this file duplicates a small amount of setup
 * rather than sharing a test-utils module, matching this repo's existing
 * realdb spec convention of self-contained files).
 *
 * [I8] Every cleanup delete below is scoped to THIS suite's own rows
 * (tracked externalEventIds, this suite's storeId, this suite's phone
 * prefix) rather than table-wide `deleteMany({})` calls — Jest's
 * `--maxWorkers=2` runs test FILES in true parallel worker processes
 * against the SAME database, so an unscoped delete in this file's
 * afterAll could wipe rows reservations.realdb.spec.ts (running
 * concurrently in the other worker) still depends on, or vice versa.
 * Cleanup failures are logged rather than silently swallowed — a
 * swallowed cleanup failure is exactly the kind of bug (like the
 * unscoped-delete interference above) that stays invisible until it
 * corrupts an unrelated test run.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const WEBHOOK_SECRET = "realdb-test-webhook-secret";
const PHONE_PREFIX = "+9055513";

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
  const settle = new PaymentSettleService(
    prisma as any,
    offerStock,
    facade,
    outbox,
  );
  const sweeper = new PaymentsSweeperService(prisma as any, facade, settle);
  const webhookController = new PaymentsWebhookController(facade, settle);
  return { reservations, settle, sweeper, webhookController, mockProvider };
}

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[payment-settle.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
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
      // Explicit APPROVED — this suite drives reservations.create() (the
      // atomic claim), which since [M1] requires the offer's owning
      // merchant to be APPROVED. See reservations.realdb.spec.ts's
      // identical fixture comment for the full rationale.
      verificationStatus: "APPROVED",
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
// never collides across the tests below — mirrors
// reservations.realdb.spec.ts's identical fix for the same reason.
async function seedOfferAndReservation(
  prisma: PrismaClient,
  reservations: ReservationsService,
  storeId: string,
) {
  const n = seedCounter++;
  const user = await prisma.user.create({
    data: { phoneE164: `${PHONE_PREFIX}${n.toString().padStart(5, "0")}` },
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
  // [I8] Tracks every externalEventId this suite creates so
  // webhookEventLog cleanup can be scoped to exactly those rows instead of
  // a table-wide deleteMany({}) that could delete rows another
  // concurrently-running suite created.
  const externalEventIds: string[] = [];

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
    await safeCleanup("webhookEventLog", () =>
      prisma.webhookEventLog.deleteMany({
        where: { externalEventId: { in: externalEventIds } },
      }),
    );
    // PaymentSettleService's successful-settle path publishes a
    // reservation.confirmed.v1 outbox row keyed off the reservation id —
    // nothing in this suite drains it, so uncleaned it sits QUEUED and gets
    // swept into outbox-worker.realdb.spec.ts's platform-wide claim (see
    // that file's own doc comment for why that breaks its exact-count
    // assertions).
    const reservationsForCleanup = await prisma.reservation.findMany({
      where: { storeId },
      select: { id: true },
    });
    await safeCleanup("outboxEvent (reservation-confirmed)", () =>
      prisma.outboxEvent.deleteMany({
        where: {
          type: "reservation.confirmed.v1",
          idempotencyKey: {
            in: reservationsForCleanup.map(
              (r) => `reservation-confirmed:${r.id}`,
            ),
          },
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
    // seedMerchantStoreTemplate's own BagTemplate plus one per
    // seedOfferAndReservation() call — sweep them all by storeId.
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

  it("webhook idempotency: the SAME success payload delivered 3x in parallel settles exactly once", async () => {
    const { reservations, settle } = buildHarness(prisma);
    const { offer, created } = await seedOfferAndReservation(
      prisma,
      reservations,
      storeId,
    );
    const offerBefore = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });

    const event: ParsedWebhookEvent = {
      merchantOid: created.payment.merchantOid,
      status: "success",
      totalCents: created.totalCents,
      externalEventId: `evt-idempotency-${created.reservationId}`,
    };
    externalEventIds.push(event.externalEventId);

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

    // [tautology fix] Stock was claimed once at create() and is untouched
    // by a successful settle — assert against the value CAPTURED right
    // after create(), not a loose lower bound that would pass even if a
    // bug released or double-claimed stock.
    const finalOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(finalOffer.qtyReserved).toBe(offerBefore.qtyReserved);
  }, 15_000);

  it("[C2] amount mismatch is quarantined: Payment FAILED, Reservation EXPIRED, stock released — not left stuck in INTENT forever", async () => {
    const { reservations, settle } = buildHarness(prisma);
    const { offer, created } = await seedOfferAndReservation(
      prisma,
      reservations,
      storeId,
    );
    const offerBefore = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });

    const externalEventId = `evt-mismatch-${created.reservationId}`;
    externalEventIds.push(externalEventId);

    const outcome = await settle.settle({
      merchantOid: created.payment.merchantOid,
      status: "success",
      totalCents: created.totalCents - 1,
      externalEventId,
    });

    expect(outcome).toBe("amount_mismatch_quarantined");

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { merchantOid: created.payment.merchantOid },
    });
    expect(payment.status).toBe("FAILED");

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservationId },
    });
    expect(reservation.status).toBe("EXPIRED");

    const finalOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(finalOffer.qtyReserved).toBe(
      offerBefore.qtyReserved - reservation.qty,
    );
  }, 15_000);

  it("[I5] sweeper vs webhook race: the REAL sweeper (queryStatus -> branch -> settle) racing a REAL webhook delivery resolves to exactly one effect, never both", async () => {
    const { reservations, sweeper, webhookController, mockProvider } =
      buildHarness(prisma);
    const { offer, created } = await seedOfferAndReservation(
      prisma,
      reservations,
      storeId,
    );
    const offerBefore = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });

    // Force the sweeper's own queryStatus call to see "pending" — the
    // real-world scenario this race models is the provider's success
    // webhook being in flight/delayed while the sweeper's OWN poll of the
    // provider still sees no confirmation. Without pinning this, the
    // webhook side's real parseWebhook() call (which also updates the
    // mock provider's internal status, by design — see
    // MockPaymentProvider's doc comment) could race ahead of the
    // sweeper's queryStatus() and make both sides observe "paid",
    // collapsing this into a same-outcome race instead of the
    // opposite-outcome race this spec exists to prove.
    jest
      .spyOn(mockProvider, "queryStatus")
      .mockResolvedValueOnce({ status: "pending" });

    const { body, headers } = mockProvider.buildWebhookRequest({
      merchantOid: created.payment.merchantOid,
      status: "success",
      totalCents: created.totalCents,
    });
    const parsedBody = JSON.parse(body) as { eventId: string };
    externalEventIds.push(parsedBody.eventId);
    const fakeReq = {
      body: parsedBody,
      rawBody: Buffer.from(body),
      headers,
    } as any;

    await Promise.all([
      sweeper.sweepOne(created.payment.merchantOid, created.totalCents),
      webhookController.handle(fakeReq),
    ]);
    // Both calls always resolve (never throw) by design — the outcome has
    // to be read back from the DB, not from either call's return value.

    // [I8] The sweeper mints its own externalEventId internally
    // (`sweep:<merchantOid>:<random>` — payments-sweeper.service.ts) that
    // this test never sees directly. merchantOid itself is already
    // globally unique per reservation (embeds a timestamp + random
    // suffix), so filtering WebhookEventLog by that prefix reliably picks
    // up exactly the row this race created, for scoped cleanup.
    const sweepLogs = await prisma.webhookEventLog.findMany({
      where: {
        externalEventId: {
          startsWith: `sweep:${created.payment.merchantOid}:`,
        },
      },
    });
    externalEventIds.push(...sweepLogs.map((row) => row.externalEventId));

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservationId },
    });
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { merchantOid: created.payment.merchantOid },
    });
    const finalOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });

    if (reservation.status === "CONFIRMED") {
      // The webhook won the race.
      expect(payment.status).toBe("PAID");
      expect(finalOffer.qtyReserved).toBe(offerBefore.qtyReserved);
    } else {
      // The sweeper's expiry won the race.
      expect(reservation.status).toBe("EXPIRED");
      expect(payment.status).toBe("FAILED");
      // Stock was released back — never both confirmed AND released.
      expect(finalOffer.qtyReserved).toBe(
        offerBefore.qtyReserved - reservation.qty,
      );
    }
  }, 15_000);
});
