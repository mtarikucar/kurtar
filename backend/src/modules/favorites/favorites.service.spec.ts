import { NotFoundException } from "@nestjs/common";
import { FavoritesService } from "./favorites.service";

function buildPrisma(overrides: Record<string, any> = {}) {
  return {
    store: { findUnique: jest.fn(), ...overrides.store },
    favorite: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      ...overrides.favorite,
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

describe("FavoritesService.add", () => {
  it("throws STORE_NOT_FOUND for a nonexistent store", async () => {
    const prisma = buildPrisma();
    const service = new FavoritesService(prisma as any);
    await expect(service.add("u1", "missing-store")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.favorite.upsert).not.toHaveBeenCalled();
  });

  it("upserts on the compound unique index — idempotent on a repeat add", async () => {
    const prisma = buildPrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "s1" }) },
    });
    const service = new FavoritesService(prisma as any);
    const result = await service.add("u1", "s1");
    expect(result).toEqual({ favorited: true });
    expect(prisma.favorite.upsert).toHaveBeenCalledWith({
      where: { userId_storeId: { userId: "u1", storeId: "s1" } },
      create: { userId: "u1", storeId: "s1" },
      update: {},
    });
  });
});

describe("FavoritesService.remove", () => {
  it("deleteMany never throws even when nothing matches — idempotent both ways", async () => {
    const prisma = buildPrisma({
      favorite: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });
    const service = new FavoritesService(prisma as any);
    const result = await service.remove("u1", "s1");
    expect(result).toEqual({ favorited: false });
    expect(prisma.favorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", storeId: "s1" },
    });
  });
});

describe("FavoritesService.listMine", () => {
  it("batches the live-offer-today check into ONE query for the whole page, not N+1", async () => {
    const rows = [
      {
        storeId: "s1",
        createdAt: new Date("2026-01-01"),
        store: {
          id: "s1",
          name: "Store 1",
          district: "Kadıköy",
          city: "İstanbul",
          coverImageUrl: null,
          avgStars: 4.5,
          ratingCount: 10,
          active: true,
        },
      },
      {
        storeId: "s2",
        createdAt: new Date("2026-01-02"),
        store: {
          id: "s2",
          name: "Store 2",
          district: "Beşiktaş",
          city: "İstanbul",
          coverImageUrl: null,
          avgStars: 0,
          ratingCount: 0,
          active: true,
        },
      },
    ];
    const prisma = buildPrisma({
      favorite: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(2),
      },
    });
    prisma.$queryRaw = jest.fn().mockResolvedValue([{ storeId: "s1" }]);
    const service = new FavoritesService(prisma as any);

    const result = await service.listMine("u1", 1, 20);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([
      expect.objectContaining({ storeId: "s1", hasLiveOfferToday: true }),
      expect.objectContaining({ storeId: "s2", hasLiveOfferToday: false }),
    ]);
    expect(result.total).toBe(2);
  });

  it("skips the batch query entirely for an empty page", async () => {
    const prisma = buildPrisma();
    const service = new FavoritesService(prisma as any);
    const result = await service.listMine("u1", 1, 20);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
  });
});
