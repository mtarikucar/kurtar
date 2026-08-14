import { PrismaClient } from "@prisma/client";
import { ReservationsService } from "../reservations/reservations.service";
import { OfferStockService } from "../reservations/offer-stock.service";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { istanbulDateKey } from "../../common/utils/istanbul-date.util";
import { OffersService } from "./offers.service";
import { OutboxService } from "../outbox/outbox.service";
import type { CreateOfferDto } from "./dto/create-offer.dto";

// Turkey has observed a single, permanent UTC+3 offset year-round since
// September 2016 (no DST) — so an Istanbul wall-clock time converts to
// UTC via a fixed 3-hour subtraction, no timezone library needed.
const ISTANBUL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Builds a pickup window safely in the MIDDLE of a future Istanbul
 * calendar day (comfortably far from midnight in either direction), so
 * the fixture is never flaky regardless of what wall-clock time the test
 * actually runs at. The previous version derived offerDate via
 * `new Date(pickupStartAt.getTime() + 3h).toISOString().slice(0,10)` —
 * hacky arithmetic that silently picked the WRONG Istanbul calendar day
 * whenever the suite ran within a few hours of Istanbul midnight (see
 * offer-window.rules.ts's own doc comment for why UTC-day and
 * Istanbul-day can differ), failing with OFFER_WINDOW_NOT_SAME_DAY.
 */
function fixedFutureIstanbulWindow(daysAhead: number) {
  const targetDay = istanbulDateKey(
    new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000),
  );
  const [year, month, day] = targetDay.split("-").map(Number);
  const pickupStartAt = new Date(
    Date.UTC(year, month - 1, day, 12, 0) - ISTANBUL_UTC_OFFSET_MS, // 12:00 Istanbul
  );
  const pickupEndAt = new Date(
    Date.UTC(year, month - 1, day, 14, 0) - ISTANBUL_UTC_OFFSET_MS, // 14:00 Istanbul
  );
  return { offerDate: targetDay, pickupStartAt, pickupEndAt };
}

/**
 * Real-DB proof of the brief's "Unique (bagTemplateId, offerDate) surfaced
 * as friendly 409" requirement (§3) — needs a genuine Postgres unique
 * constraint violation (@@unique([bagTemplateId, offerDate]) on
 * DailyOffer), not something a mocked Prisma client could prove. Small and
 * single-purpose on top of the 5 required realdb specs, not a duplicate of
 * any of them. Only runs when TEST_DATABASE_URL is set (Task 2/3/4's
 * realdb gate pattern).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

d(
  "OffersService.create — real DB (bagTemplateId, offerDate) uniqueness",
  () => {
    let prisma: PrismaClient;
    let merchantId: string;
    let storeId: string;

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL! } },
      });
      const merchant = await prisma.merchant.create({
        data: {
          legalName: "Offer Date Uniqueness Realdb Test",
          tradeName: "Offer Date Uniqueness Realdb Test",
          taxId: `ODUQ${Date.now()}`.slice(0, 10),
          iban: "TR330006100519786457841326",
          verificationStatus: "APPROVED",
        },
      });
      merchantId = merchant.id;
      const store = await prisma.store.create({
        data: {
          merchantId,
          name: "Offer Date Uniqueness Realdb Test Store",
          address: "Test Sk. No:7",
          district: "Kadıköy",
          city: "İstanbul",
          latitude: 40.99,
          longitude: 29.03,
        },
      });
      storeId = store.id;
    });

    afterAll(async () => {
      if (!prisma) return;
      await prisma.dailyOffer
        .deleteMany({ where: { storeId } })
        .catch(() => undefined);
      await prisma.bagTemplate
        .deleteMany({ where: { storeId } })
        .catch(() => undefined);
      await prisma.store
        .delete({ where: { id: storeId } })
        .catch(() => undefined);
      await prisma.merchant
        .delete({ where: { id: merchantId } })
        .catch(() => undefined);
      await prisma.$disconnect();
    });

    it("a second create() for the same (bagTemplateId, offerDate) throws a friendly 409, not a raw Prisma error", async () => {
      const registry = new PaymentProviderRegistry();
      const config = { get: () => "mock" } as any;
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

      const bagTemplate = await prisma.bagTemplate.create({
        data: {
          storeId,
          title: "Offer Date Uniqueness Realdb Test Bag",
          category: "BAKERY",
          allergenDisclaimer: "N/A",
          originalValueCentsMin: 10000,
          originalValueCentsMax: 20000,
          priceCents: 5900,
        },
      });

      // 3 days out, mid-day Istanbul — comfortably future (never trips
      // OFFER_WINDOW_NOT_FUTURE) and comfortably non-boundary (never trips
      // OFFER_WINDOW_NOT_SAME_DAY), regardless of when this suite runs.
      const { offerDate, pickupStartAt, pickupEndAt } =
        fixedFutureIstanbulWindow(3);

      const dto: CreateOfferDto = {
        bagTemplateId: bagTemplate.id,
        offerDate,
        qtyTotal: 3,
        pickupStartAt: pickupStartAt.toISOString(),
        pickupEndAt: pickupEndAt.toISOString(),
      };

      const first = await offers.create(merchantId, dto);
      expect(first.id).toBeTruthy();

      await expect(offers.create(merchantId, dto)).rejects.toMatchObject({
        response: { errorCode: "OFFER_DATE_ALREADY_EXISTS", statusCode: 409 },
      });

      // Exactly one DailyOffer row exists for this (bagTemplateId, offerDate)
      // — the second attempt never partially wrote anything.
      const count = await prisma.dailyOffer.count({
        where: { bagTemplateId: bagTemplate.id },
      });
      expect(count).toBe(1);
    }, 15_000);
  },
);
