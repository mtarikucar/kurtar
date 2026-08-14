import { PushTokensService } from "./push-tokens.service";

function buildPrisma() {
  return {
    pushToken: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe("PushTokensService.register", () => {
  it("upserts on expoPushToken, setting lastSeenAt and clearing disabledAt", async () => {
    const prisma = buildPrisma();
    const service = new PushTokensService(prisma as any);

    const result = await service.register("u1", "tok1", "IOS");

    expect(result).toEqual({ ok: true });
    expect(prisma.pushToken.upsert).toHaveBeenCalledWith({
      where: { expoPushToken: "tok1" },
      update: {
        userId: "u1",
        platform: "IOS",
        lastSeenAt: expect.any(Date),
        disabledAt: null,
      },
      create: {
        userId: "u1",
        expoPushToken: "tok1",
        platform: "IOS",
        lastSeenAt: expect.any(Date),
      },
    });
  });
});

describe("PushTokensService.remove", () => {
  it("scopes the delete to (expoPushToken, userId) and reports deleted:true on a match", async () => {
    const prisma = buildPrisma();
    const service = new PushTokensService(prisma as any);

    const result = await service.remove("u1", "tok1");

    expect(result).toEqual({ deleted: true });
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { expoPushToken: "tok1", userId: "u1" },
    });
  });

  it("reports deleted:false when nothing matched (not owned, or already gone)", async () => {
    const prisma = buildPrisma();
    prisma.pushToken.deleteMany.mockResolvedValue({ count: 0 });
    const service = new PushTokensService(prisma as any);

    const result = await service.remove("u1", "someone-elses-token");

    expect(result).toEqual({ deleted: false });
  });
});
