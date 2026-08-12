import { PrismaClient } from "@prisma/client";
import { ReservationsService } from "../reservations/reservations.service";
import { OfferStockService } from "../reservations/offer-stock.service";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { OffersService } from "./offers.service";
import type { CreateOfferDto } from "./dto/create-offer.dto";

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
      const reservations = new ReservationsService(
        prisma as any,
        offerStock,
        facade,
      );
      const offers = new OffersService(prisma as any, reservations);

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

      const pickupStartAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const pickupEndAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const offerDate = new Date(pickupStartAt.getTime() + 3 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10); // approximates the Europe/Istanbul calendar day for this window

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
