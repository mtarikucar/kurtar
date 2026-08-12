import { PrismaClient } from "@prisma/client";

/**
 * Real-DB smoke test for the Task 2 schema/migration. Only runs when
 * TEST_DATABASE_URL is set (a real Postgres+PostGIS instance — see
 * ops/docker-compose.yml) so the normal mocked/unit suite is unaffected and
 * this file skips cleanly in any environment that hasn't opted in.
 *
 * Proves, against the actual applied migration (not just the Prisma
 * schema):
 *   - Merchant -> Store -> BagTemplate -> DailyOffer can be written and
 *     read back through the generated client.
 *   - stores.location (geography(Point,4326)) round-trips through raw SQL
 *     and ST_DWithin finds a store within 1km of a nearby point.
 *   - The daily_offers CHECK constraints are enforced by Postgres itself,
 *     not just application code (an update that pushes qtyReserved above
 *     qtyTotal is rejected by the database).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

d("schema — real DB smoke test", () => {
  let prisma: PrismaClient;

  // Kadıköy, Istanbul. searchPoint is ~550m away — inside the 1km radius
  // the ST_DWithin query below checks, but not the same point, so the
  // index/query actually has to do distance math rather than match 0.
  const storeLat = 40.9909;
  const storeLng = 29.0304;
  const searchLat = 40.9959;
  const searchLng = 29.0304;

  let merchantId: string;
  let storeId: string;
  let bagTemplateId: string;
  let dailyOfferId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });

    const merchant = await prisma.merchant.create({
      data: {
        legalName: "Kurtar Test Gıda A.Ş.",
        tradeName: "Kurtar Test Fırın",
        taxId: "1111111111",
        iban: "TR000006701000000000000001",
      },
    });
    merchantId = merchant.id;

    const store = await prisma.store.create({
      data: {
        merchantId,
        name: "Test Fırın Kadıköy",
        address: "Test Sok. No:1",
        district: "Kadıköy",
        city: "İstanbul",
        latitude: storeLat,
        longitude: storeLng,
      },
    });
    storeId = store.id;

    // `location` is an Unsupported("geography(Point,4326)") field — the
    // generated client cannot select/write it, so it's set via raw SQL,
    // exactly as the application layer will do post-Task-2.
    await prisma.$executeRaw`
      UPDATE "stores"
      SET "location" = ST_SetSRID(ST_MakePoint(${storeLng}, ${storeLat}), 4326)::geography
      WHERE "id" = ${storeId}
    `;

    const bagTemplate = await prisma.bagTemplate.create({
      data: {
        storeId,
        title: "Sürpriz Paket",
        category: "BAKERY",
        allergenDisclaimer: "Gluten içerebilir.",
        originalValueCentsMin: 15000,
        originalValueCentsMax: 25000,
        priceCents: 5000,
      },
    });
    bagTemplateId = bagTemplate.id;

    const dailyOffer = await prisma.dailyOffer.create({
      data: {
        bagTemplateId,
        storeId,
        offerDate: new Date("2026-08-13T00:00:00.000Z"),
        qtyTotal: 5,
        pickupStartAt: new Date("2026-08-13T18:00:00.000Z"),
        pickupEndAt: new Date("2026-08-13T20:00:00.000Z"),
      },
    });
    dailyOfferId = dailyOffer.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.dailyOffer
      .delete({ where: { id: dailyOfferId } })
      .catch(() => {});
    await prisma.bagTemplate
      .delete({ where: { id: bagTemplateId } })
      .catch(() => {});
    await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("round-trips stores.location through raw SQL and finds it via ST_DWithin", async () => {
    const nearby = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "stores"
      WHERE "id" = ${storeId}
        AND ST_DWithin(
          "location",
          ST_SetSRID(ST_MakePoint(${searchLng}, ${searchLat}), 4326)::geography,
          1000
        )
    `;

    expect(nearby).toHaveLength(1);
    expect(nearby[0].id).toBe(storeId);
  });

  it("writes the BagTemplate -> DailyOffer chain and reads it back", async () => {
    const offer = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: dailyOfferId },
    });

    expect(offer.bagTemplateId).toBe(bagTemplateId);
    expect(offer.storeId).toBe(storeId);
    expect(offer.qtyTotal).toBe(5);
    expect(offer.qtyReserved).toBe(0);
  });

  it("rejects qtyReserved > qtyTotal at the database layer", async () => {
    await expect(
      prisma.dailyOffer.update({
        where: { id: dailyOfferId },
        data: { qtyReserved: 6 }, // qtyTotal is 5
      }),
    ).rejects.toThrow(/daily_offers_qty_reserved_within_total/);
  });
});
