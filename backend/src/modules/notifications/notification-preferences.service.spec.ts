import { Prisma } from "@prisma/client";
import { NotificationPreferencesService } from "./notification-preferences.service";

function uniqueUserIdViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.0",
    meta: { target: ["userId"] },
  });
}

function buildPrisma() {
  return {
    notificationPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe("NotificationPreferencesService.getOrCreate", () => {
  it("returns the existing row without creating one", async () => {
    const prisma = buildPrisma();
    const existing = { userId: "u1", favoritesEnabled: true };
    prisma.notificationPreference.findUnique.mockResolvedValue(existing);
    const service = new NotificationPreferencesService(prisma as any);

    const result = await service.getOrCreate("u1");

    expect(result).toBe(existing);
    expect(prisma.notificationPreference.create).not.toHaveBeenCalled();
  });

  it("creates a default row on first read when none exists", async () => {
    const prisma = buildPrisma();
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
    const created = { userId: "u1", favoritesEnabled: true };
    prisma.notificationPreference.create.mockResolvedValue(created);
    const service = new NotificationPreferencesService(prisma as any);

    const result = await service.getOrCreate("u1");

    expect(result).toBe(created);
    expect(prisma.notificationPreference.create).toHaveBeenCalledWith({
      data: { userId: "u1" },
    });
  });

  it("a concurrent create race (P2002 on userId) falls back to re-reading the winner's row", async () => {
    const prisma = buildPrisma();
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
    prisma.notificationPreference.create.mockRejectedValue(
      uniqueUserIdViolation(),
    );
    const winnerRow = { userId: "u1", favoritesEnabled: true };
    prisma.notificationPreference.findUniqueOrThrow.mockResolvedValue(
      winnerRow,
    );
    const service = new NotificationPreferencesService(prisma as any);

    const result = await service.getOrCreate("u1");

    expect(result).toBe(winnerRow);
  });

  it("rethrows a non-collision error from create", async () => {
    const prisma = buildPrisma();
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
    prisma.notificationPreference.create.mockRejectedValue(
      new Error("db down"),
    );
    const service = new NotificationPreferencesService(prisma as any);

    await expect(service.getOrCreate("u1")).rejects.toThrow("db down");
  });
});

describe("NotificationPreferencesService.update", () => {
  it("ensures the row exists (getOrCreate) before applying the patch", async () => {
    const prisma = buildPrisma();
    prisma.notificationPreference.findUnique.mockResolvedValue({
      userId: "u1",
    });
    const updated = { userId: "u1", nearbyEnabled: true };
    prisma.notificationPreference.update.mockResolvedValue(updated);
    const service = new NotificationPreferencesService(prisma as any);

    const result = await service.update("u1", { nearbyEnabled: true });

    expect(result).toBe(updated);
    expect(prisma.notificationPreference.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { nearbyEnabled: true },
    });
  });
});
