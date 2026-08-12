import { PrismaClient } from "@prisma/client";
import { StoresService } from "./stores.service";
import type { CreateStoreDto } from "./dto/create-store.dto";
import type { UpdateStoreDto } from "./dto/update-store.dto";

/**
 * Real-DB proof that StoresService — not just raw SQL by itself — writes
 * `stores.location` correctly on create AND update, reusing Task 2's
 * ST_DWithin pattern (prisma/schema.realdb.spec.ts) but exercised through
 * the actual service method a merchant's POST/PATCH /api/stores calls, in
 * the same $transaction as the Prisma row write. Only runs when
 * TEST_DATABASE_URL is set (Task 2/3/4's realdb gate pattern).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[stores-geo-write.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

d("StoresService — real DB geo write", () => {
  let prisma: PrismaClient;
  let merchantId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL! } },
    });

    const merchant = await prisma.merchant.create({
      data: {
        legalName: "Stores Geo Realdb Test A.Ş.",
        tradeName: "Stores Geo Realdb Test Fırın",
        taxId: `SGEO${Date.now()}`.slice(0, 10),
        iban: "TR330006100519786457841326",
        verificationStatus: "APPROVED", // create() requires an APPROVED merchant
      },
    });
    merchantId = merchant.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await safeCleanup("store", () =>
      prisma.store.deleteMany({ where: { merchantId } }),
    );
    await safeCleanup("merchant", () =>
      prisma.merchant.delete({ where: { id: merchantId } }),
    );
    await prisma.$disconnect();
  });

  it("create() sets location in the same transaction as the row write; ST_DWithin finds it nearby, not far away", async () => {
    const service = new StoresService(prisma as any);
    const storeLat = 40.9909;
    const storeLng = 29.0304;

    const dto: CreateStoreDto = {
      name: "Kadıköy Test Store",
      address: "Test Sk. No:1",
      district: "Kadıköy",
      city: "İstanbul",
      latitude: storeLat,
      longitude: storeLng,
    };
    const store = await service.create(merchantId, dto);

    // ~550m away — inside a 1km radius, but far enough that this proves
    // real distance math ran, not a same-point match.
    const searchLat = 40.9959;
    const nearby = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "stores"
      WHERE "id" = ${store.id}
        AND ST_DWithin(
          "location",
          ST_SetSRID(ST_MakePoint(${storeLng}, ${searchLat}), 4326)::geography,
          1000
        )
    `;
    expect(nearby).toHaveLength(1);
    expect(nearby[0].id).toBe(store.id);

    const farAway = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "stores"
      WHERE "id" = ${store.id}
        AND ST_DWithin(
          "location",
          ST_SetSRID(ST_MakePoint(${storeLng}, ${storeLat + 1}), 4326)::geography,
          1000
        )
    `;
    expect(farAway).toHaveLength(0);
  }, 15_000);

  it("update() with new lat/lng re-sets location so ST_DWithin reflects the move", async () => {
    const service = new StoresService(prisma as any);
    const createDto: CreateStoreDto = {
      name: "Moving Test Store",
      address: "Test Sk. No:2",
      district: "Beşiktaş",
      city: "İstanbul",
      latitude: 41.0,
      longitude: 29.0,
    };
    const store = await service.create(merchantId, createDto);

    const newLat = 41.05;
    const newLng = 29.05;
    const updateDto: UpdateStoreDto = { latitude: newLat, longitude: newLng };
    await service.update(merchantId, store.id, updateDto);

    const atNewLocation = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "stores"
      WHERE "id" = ${store.id}
        AND ST_DWithin(
          "location",
          ST_SetSRID(ST_MakePoint(${newLng}, ${newLat}), 4326)::geography,
          100
        )
    `;
    expect(atNewLocation).toHaveLength(1);

    const atOldLocation = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "stores"
      WHERE "id" = ${store.id}
        AND ST_DWithin(
          "location",
          ST_SetSRID(ST_MakePoint(29.0, 41.0), 4326)::geography,
          100
        )
    `;
    expect(atOldLocation).toHaveLength(0);
  }, 15_000);

  it("update() WITHOUT touching lat/lng leaves location unchanged", async () => {
    const service = new StoresService(prisma as any);
    const createDto: CreateStoreDto = {
      name: "Untouched Location Store",
      address: "Test Sk. No:3",
      district: "Şişli",
      city: "İstanbul",
      latitude: 41.1,
      longitude: 28.9,
    };
    const store = await service.create(merchantId, createDto);

    await service.update(merchantId, store.id, { name: "Renamed Store" });

    const stillAtOriginal = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "stores"
      WHERE "id" = ${store.id}
        AND ST_DWithin(
          "location",
          ST_SetSRID(ST_MakePoint(28.9, 41.1), 4326)::geography,
          10
        )
    `;
    expect(stillAtOriginal).toHaveLength(1);
  }, 15_000);
});
