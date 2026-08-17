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
 * Real-DB proof of OffersService.publishDueScheduled — the method
 * OffersPublishSchedulerService's every-minute cron calls (§3 of the Task
 * 5 brief: "SCHEDULED with publishAt<=now → PUBLISHED"). Only runs when
 * TEST_DATABASE_URL is set (Task 2/3/4's realdb gate pattern).
 *
 * publishDueScheduled() queries ALL due SCHEDULED offers table-wide, not
 * scoped to this suite's own rows — so assertions below check the
 * SPECIFIC offers this test seeded (by re-reading them after the call),
 * never a global count off the method's own summary return value, which
 * could be inflated by an unrelated SCHEDULED row anywhere else in the
 * same shared dev database.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const WEBHOOK_SECRET = "realdb-publish-scheduler-test-webhook-secret";

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
  return { offers };
}

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[offers-publish-scheduler.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

async function seedMerchantAndStore(prisma: PrismaClient) {
  const merchant = await prisma.merchant.create({
    data: {
      legalName: "Publish Scheduler Realdb Test A.Ş.",
      tradeName: "Publish Scheduler Realdb Test Fırın",
      taxId: `PSCH${Date.now()}`.slice(0, 10),
      iban: "TR330006100519786457841326",
      verificationStatus: "APPROVED",
    },
  });
  const store = await prisma.store.create({
    data: {
      merchantId: merchant.id,
      name: "Publish Scheduler Realdb Test Store",
      address: "Test Sk. No:6",
      district: "Kadıköy",
      city: "İstanbul",
      latitude: 40.99,
      longitude: 29.03,
    },
  });
  return { merchant, store };
}

async function createBagTemplate(
  prisma: PrismaClient,
  storeId: string,
  title: string,
) {
  return prisma.bagTemplate.create({
    data: {
      storeId,
      title,
      category: "BAKERY",
      allergenDisclaimer: "N/A",
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
      priceCents: 5900,
    },
  });
}

async function seedScheduledOffer(
  prisma: PrismaClient,
  bagTemplateId: string,
  storeId: string,
  publishAt: Date,
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
      status: "SCHEDULED",
      publishAt,
    },
  });
}

d("OffersService.publishDueScheduled — real DB", () => {
  let prisma: PrismaClient;
  let merchantId: string;
  let storeId: string;
  const offerIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL! } },
    });
    const seeded = await seedMerchantAndStore(prisma);
    merchantId = seeded.merchant.id;
    storeId = seeded.store.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await safeCleanup("outboxEvent", () =>
      prisma.outboxEvent.deleteMany({
        where: {
          type: "offer.published.v1",
          idempotencyKey: { in: offerIds.map((id) => `offer-published:${id}`) },
        },
      }),
    );
    await safeCleanup("dailyOffer", () =>
      prisma.dailyOffer.deleteMany({ where: { storeId } }),
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

  it("publishes a due SCHEDULED offer (publishAt in the past), leaves a future-publishAt one untouched", async () => {
    const { offers } = buildHarness(prisma);
    const now = new Date();

    const dueTemplate = await createBagTemplate(
      prisma,
      storeId,
      "Due Offer Bag",
    );
    const futureTemplate = await createBagTemplate(
      prisma,
      storeId,
      "Future Offer Bag",
    );
    const dueOffer = await seedScheduledOffer(
      prisma,
      dueTemplate.id,
      storeId,
      new Date(now.getTime() - 60_000), // 1 minute ago — due
    );
    const futureOffer = await seedScheduledOffer(
      prisma,
      futureTemplate.id,
      storeId,
      new Date(now.getTime() + 60 * 60_000), // 1 hour from now — not due
    );
    offerIds.push(dueOffer.id, futureOffer.id);

    await offers.publishDueScheduled();

    const [finalDue, finalFuture] = await Promise.all([
      prisma.dailyOffer.findUniqueOrThrow({ where: { id: dueOffer.id } }),
      prisma.dailyOffer.findUniqueOrThrow({ where: { id: futureOffer.id } }),
    ]);

    expect(finalDue.status).toBe("PUBLISHED");
    expect(finalDue.publishedAt).not.toBeNull();

    expect(finalFuture.status).toBe("SCHEDULED");
    expect(finalFuture.publishedAt).toBeNull();

    const outboxRow = await prisma.outboxEvent.findFirst({
      where: {
        type: "offer.published.v1",
        idempotencyKey: `offer-published:${dueOffer.id}`,
      },
    });
    expect(outboxRow).not.toBeNull();
    expect(
      await prisma.outboxEvent.findFirst({
        where: {
          type: "offer.published.v1",
          idempotencyKey: `offer-published:${futureOffer.id}`,
        },
      }),
    ).toBeNull();
  }, 15_000);

  it("a due SCHEDULED offer whose pickup window has already passed is terminalized to CANCELLED, not retried forever", async () => {
    const { offers } = buildHarness(prisma);
    const now = new Date();

    const expiredTemplate = await createBagTemplate(
      prisma,
      storeId,
      "Expired Window Bag",
    );
    const expiredWindowOffer = await prisma.dailyOffer.create({
      data: {
        bagTemplateId: expiredTemplate.id,
        storeId,
        offerDate: new Date(now.toISOString().slice(0, 10)),
        qtyTotal: 5,
        pickupStartAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        pickupEndAt: new Date(now.getTime() - 60 * 60 * 1000), // pickup window already over
        status: "SCHEDULED",
        publishAt: new Date(now.getTime() - 60_000), // due
      },
    });
    offerIds.push(expiredWindowOffer.id);

    const result = await offers.publishDueScheduled();
    expect(result.expiredCount).toBeGreaterThanOrEqual(1);

    const final = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: expiredWindowOffer.id },
    });
    // Terminalized to CANCELLED — never silently published with an
    // already-passed pickup window, and (unlike a bare "skip and log")
    // never crashes the rest of the sweep AND never sits SCHEDULED
    // forever, re-selected and re-failed on every future tick.
    expect(final.status).toBe("CANCELLED");

    // Proof it's actually terminal, not just "happened to be CANCELLED
    // this tick": a second sweep no longer selects it at all (it's not
    // SCHEDULED anymore), so it can't be re-terminalized or counted again.
    await offers.publishDueScheduled();
    const stillThere = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: expiredWindowOffer.id },
    });
    expect(stillThere.status).toBe("CANCELLED");
  }, 15_000);
});
