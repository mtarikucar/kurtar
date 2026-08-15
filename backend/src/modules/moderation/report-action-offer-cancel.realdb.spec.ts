import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { OfferStockService } from "../reservations/offer-stock.service";
import { ReservationsService } from "../reservations/reservations.service";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { OffersService } from "../offers/offers.service";
import { OutboxService } from "../outbox/outbox.service";
import { RatingsService } from "../ratings/ratings.service";
import { StoresService } from "../stores/stores.service";
import { ModerationService } from "./moderation.service";

/**
 * Real-DB proof of brief §8's mandatory scenario (d): a content-report
 * "action" on an OFFER target genuinely runs Task 5's existing offer-
 * cancel fan-out (OffersService.adminCancel -> cancelOne, the SAME
 * private method cancel()/cancelAllActiveForMerchant() use) — reservations
 * get CANCELLED_BY_MERCHANT and refunds actually get recorded, not just
 * a status flip on the ContentReport row. Mirrors
 * offers/offer-cancel-fanout.realdb.spec.ts's harness/fixture shape
 * exactly (same seed helpers), since this IS that fan-out, reached via a
 * different front door.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const WEBHOOK_SECRET = "realdb-report-action-test-webhook-secret";
const PHONE_PREFIX = "+9055515";
const TAG = "report-action-realdb-test";

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
  const ratings = new RatingsService(prisma as any);
  const stores = new StoresService(prisma as any);
  const moderation = new ModerationService(
    prisma as any,
    ratings,
    stores,
    offers,
  );
  return { reservations, offers, moderation, mockProvider };
}

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[report-action-offer-cancel.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
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

d("ModerationService.adminAction(OFFER) — real DB fan-out reuse", () => {
  let prisma: PrismaClient;
  let merchantId: string;
  let storeId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const merchant = await prisma.merchant.create({
      data: {
        legalName: `${TAG} A.S.`,
        tradeName: `${TAG} Firin`,
        taxId: `${TAG}-${Date.now()}`.slice(0, 10),
        iban: "TR330006100519786457841326",
        verificationStatus: "APPROVED",
      },
    });
    merchantId = merchant.id;
    const store = await prisma.store.create({
      data: {
        merchantId,
        name: `${TAG} Store`,
        address: "Test Sk. No:5",
        district: "Kadikoy",
        city: "Istanbul",
        latitude: 40.96,
        longitude: 29.0,
      },
    });
    storeId = store.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await safeCleanup("outboxEvent", () =>
      prisma.outboxEvent.deleteMany({
        where: { payload: { path: ["storeId"], equals: storeId } },
      }),
    );
    await safeCleanup("auditLog", () =>
      prisma.auditLog.deleteMany({ where: { entity: "DailyOffer" } }),
    );
    await safeCleanup("contentReport", () =>
      prisma.contentReport.deleteMany({
        where: { reason: { startsWith: TAG } },
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

  it("[d] action on an OFFER report cancels its CONFIRMED reservations and records real refunds — the SAME fan-out cancel() uses, not a re-implementation", async () => {
    const { reservations, moderation } = buildHarness(prisma);

    const bagTemplate = await prisma.bagTemplate.create({
      data: {
        storeId,
        title: `${TAG} Bag`,
        category: "BAKERY",
        allergenDisclaimer: "N/A",
        originalValueCentsMin: 10000,
        originalValueCentsMax: 20000,
        priceCents: 5900,
      },
    });
    const pickupStartAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const pickupEndAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const offer = await prisma.dailyOffer.create({
      data: {
        bagTemplateId: bagTemplate.id,
        storeId,
        offerDate: new Date(pickupStartAt.toISOString().slice(0, 10)),
        qtyTotal: 5,
        pickupStartAt,
        pickupEndAt,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    const user1 = await prisma.user.create({
      data: { phoneE164: `${PHONE_PREFIX}00001` },
    });
    const user2 = await prisma.user.create({
      data: { phoneE164: `${PHONE_PREFIX}00002` },
    });

    const r1 = await reservations.create(user1.id, offer.id, 1);
    const r2 = await reservations.create(user2.id, offer.id, 1);
    await confirmAndPay(prisma, r1.reservationId, r1.payment.merchantOid);
    await confirmAndPay(prisma, r2.reservationId, r2.payment.merchantOid);

    const report = await prisma.contentReport.create({
      data: {
        targetType: "OFFER",
        targetId: offer.id,
        reason: `${TAG} — spam listing`,
        takedownDeadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    const adminId = "admin-report-action-test";
    const result = await moderation.adminAction(
      adminId,
      report.id,
      "confirmed spam",
    );

    expect(result.status).toBe("ACTIONED");
    expect(result.resolvedAt).not.toBeNull();

    const finalOffer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(finalOffer.status).toBe("CANCELLED");

    const [finalR1, finalR2] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: r1.reservationId } }),
      prisma.reservation.findUniqueOrThrow({ where: { id: r2.reservationId } }),
    ]);
    expect(finalR1.status).toBe("CANCELLED_BY_MERCHANT");
    expect(finalR2.status).toBe("CANCELLED_BY_MERCHANT");

    const [p1, p2] = await Promise.all([
      prisma.payment.findUniqueOrThrow({
        where: { merchantOid: r1.payment.merchantOid },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { merchantOid: r2.payment.merchantOid },
      }),
    ]);
    expect(p1.status).toBe("REFUNDED");
    expect(p2.status).toBe("REFUNDED");

    const refunds = await prisma.refund.findMany({
      where: { paymentId: { in: [p1.id, p2.id] } },
    });
    expect(refunds).toHaveLength(2);
    for (const refund of refunds) {
      expect(refund.status).toBe("DONE");
      // ADMIN reason, not MERCHANT_CANCEL — proves this went through the
      // admin entry point, not a disguised merchant self-cancel.
      expect(refund.reason).toBe("ADMIN");
      expect(refund.requestedByType).toBe("ADMIN");
    }

    // Both AuditLog rows exist — the offer's own (written inside
    // cancelOne's transaction) AND the report's own (written by
    // ModerationService after the fan-out completed).
    const offerAudit = await prisma.auditLog.findFirst({
      where: {
        entity: "DailyOffer",
        entityId: offer.id,
        action: "offer.admin_cancel",
      },
    });
    expect(offerAudit).not.toBeNull();
    expect(offerAudit!.actorId).toBe(adminId);

    const reportAudit = await prisma.auditLog.findFirst({
      where: {
        entity: "ContentReport",
        entityId: report.id,
        action: "report.action",
      },
    });
    expect(reportAudit).not.toBeNull();
  }, 20_000);
});
