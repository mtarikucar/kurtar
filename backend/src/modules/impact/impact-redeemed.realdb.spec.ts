import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import { ImpactLedgerHandler } from "./impact-redeemed.handler";

/**
 * Real-DB proof of brief §8's mandatory scenario (c): the impact row is
 * written EXACTLY once even if reservation.redeemed.impact.v1 is
 * dispatched twice for the same reservation — enforced by
 * ImpactLedger.reservationId's real unique constraint (P2002 swallowed
 * as a benign no-op), not merely an application-level check that a
 * second, truly-concurrent dispatch could race past.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "impact-redeemed-realdb-test";

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[impact-redeemed.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

d("ImpactLedgerHandler — real DB idempotency", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("[c] two concurrent dispatches of the SAME reservation.redeemed.impact.v1 payload write exactly one ImpactLedger row", async () => {
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
        address: "Test Sk. No:4",
        district: "Kadikoy",
        city: "Istanbul",
        latitude: 40.97,
        longitude: 29.01,
      },
    });
    const user = await prisma.user.create({
      data: { phoneE164: `+9055514${Date.now().toString().slice(-5)}` },
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
    const offer = await prisma.dailyOffer.create({
      data: {
        bagTemplateId: bagTemplate.id,
        storeId: store.id,
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
        code: `IMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        userId: user.id,
        offerId: offer.id,
        storeId: store.id,
        qty: 2,
        unitPriceCents: 5000,
        totalCents: 9000,
        status: "REDEEMED",
        cancelDeadlineAt: new Date(Date.now() - 30 * 60 * 1000),
        redeemedAt: new Date(),
      },
    });

    const registry = new OutboxHandlerRegistry();
    const config = { get: () => undefined } as unknown as ConfigService;
    const handler = new ImpactLedgerHandler(prisma as any, config, registry);

    const payload = {
      reservationId: reservation.id,
      userId: user.id,
      storeId: store.id,
      qty: reservation.qty,
      totalCents: reservation.totalCents,
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
    };

    try {
      // Two genuinely concurrent handler invocations for the SAME
      // payload — simulates the outbox worker dispatching the same row
      // twice (e.g. a stale-lease reclaim racing the original attempt).
      await Promise.all([handler.handle(payload), handler.handle(payload)]);

      const rows = await prisma.impactLedger.findMany({
        where: { reservationId: reservation.id },
      });
      expect(rows).toHaveLength(1);
      // qty=2, midpoint=(10000+20000)/2=15000, moneySaved=15000*2-9000=21000
      expect(rows[0]).toMatchObject({
        mealsSaved: 2,
        co2eGrams: 5000,
        moneySavedCents: 21000,
      });

      // A THIRD, later dispatch (e.g. after a worker crash/retry) is
      // still a clean no-op, not a duplicate.
      await handler.handle(payload);
      const rowsAfterThird = await prisma.impactLedger.findMany({
        where: { reservationId: reservation.id },
      });
      expect(rowsAfterThird).toHaveLength(1);
    } finally {
      await safeCleanup("impactLedger", () =>
        prisma.impactLedger.deleteMany({
          where: { reservationId: reservation.id },
        }),
      );
      await safeCleanup("reservation", () =>
        prisma.reservation.delete({ where: { id: reservation.id } }),
      );
      await safeCleanup("offer", () =>
        prisma.dailyOffer.delete({ where: { id: offer.id } }),
      );
      await safeCleanup("bagTemplate", () =>
        prisma.bagTemplate.delete({ where: { id: bagTemplate.id } }),
      );
      await safeCleanup("store", () =>
        prisma.store.delete({ where: { id: store.id } }),
      );
      await safeCleanup("merchant", () =>
        prisma.merchant.delete({ where: { id: merchant.id } }),
      );
      await safeCleanup("user", () =>
        prisma.user.delete({ where: { id: user.id } }),
      );
    }
  });
});
