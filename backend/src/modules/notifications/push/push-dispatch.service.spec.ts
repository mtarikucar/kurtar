import { PushDispatchService } from "./push-dispatch.service";

function buildDeps() {
  const prisma = {
    pushToken: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const facade = { sendBatch: jest.fn().mockResolvedValue([]) };
  // Default: every requested id is allowed — matches
  // NotificationPolicyService.mayNotifyBatch's Map<userId, decision> shape
  // (Important 5 fix — batched, not a per-user mayNotify() loop).
  const policy = {
    mayNotifyBatch: jest.fn().mockImplementation(async (userIds: string[]) => {
      const map = new Map<string, { allowed: boolean }>();
      for (const id of userIds) map.set(id, { allowed: true });
      return map;
    }),
  };
  return { prisma, facade, policy };
}

describe("PushDispatchService.notifyUsers", () => {
  it("empty candidate list -> no policy/token/send calls at all", async () => {
    const { prisma, facade, policy } = buildDeps();
    const service = new PushDispatchService(
      prisma as any,
      facade as any,
      policy as any,
    );

    const result = await service.notifyUsers([], "OFFER_FAVORITE", () => ({
      title: "t",
      body: "b",
    }));

    expect(result).toEqual({ candidates: 0, denied: 0, sent: 0 });
    expect(policy.mayNotifyBatch).not.toHaveBeenCalled();
    expect(prisma.pushToken.findMany).not.toHaveBeenCalled();
  });

  it("dedupes duplicate user ids into ONE batched policy call", async () => {
    const { prisma, facade, policy } = buildDeps();
    const service = new PushDispatchService(
      prisma as any,
      facade as any,
      policy as any,
    );

    await service.notifyUsers(["u1", "u1", "u1"], "OFFER_FAVORITE", () => ({
      title: "t",
      body: "b",
    }));

    expect(policy.mayNotifyBatch).toHaveBeenCalledTimes(1);
    expect(policy.mayNotifyBatch).toHaveBeenCalledWith(
      ["u1"],
      "OFFER_FAVORITE",
    );
  });

  it("a user denied by policy is excluded from the token lookup and counted in `denied`", async () => {
    const { prisma, facade, policy } = buildDeps();
    policy.mayNotifyBatch.mockResolvedValue(
      new Map([
        ["u-ok", { allowed: true }],
        ["u-denied", { allowed: false, reason: "PREFERENCE_DISABLED" }],
      ]),
    );
    const service = new PushDispatchService(
      prisma as any,
      facade as any,
      policy as any,
    );

    const result = await service.notifyUsers(
      ["u-ok", "u-denied"],
      "OFFER_FAVORITE",
      () => ({ title: "t", body: "b" }),
    );

    expect(result).toEqual({ candidates: 2, denied: 1, sent: 0 });
    expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u-ok"] }, disabledAt: null },
      take: expect.any(Number),
    });
  });

  it("queries only non-disabled tokens (disabledAt: null in the WHERE clause)", async () => {
    const { prisma, facade, policy } = buildDeps();
    prisma.pushToken.findMany.mockResolvedValue([
      { userId: "u1", expoPushToken: "tok1" },
    ]);
    facade.sendBatch.mockResolvedValue([{ to: "tok1", outcome: "ok" }]);
    const service = new PushDispatchService(
      prisma as any,
      facade as any,
      policy as any,
    );

    await service.notifyUsers(["u1"], "OFFER_FAVORITE", () => ({
      title: "t",
      body: "b",
    }));

    expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u1"] }, disabledAt: null },
      take: expect.any(Number),
    });
  });

  it("builds one message per live token via buildMessage(userId) and reports `sent` = outcome:'ok' count", async () => {
    const { prisma, facade, policy } = buildDeps();
    prisma.pushToken.findMany.mockResolvedValue([
      { userId: "u1", expoPushToken: "tok1" },
      { userId: "u2", expoPushToken: "tok2" },
    ]);
    facade.sendBatch.mockResolvedValue([
      { to: "tok1", outcome: "ok" },
      { to: "tok2", outcome: "error", error: "boom" },
    ]);
    const service = new PushDispatchService(
      prisma as any,
      facade as any,
      policy as any,
    );
    const buildMessage = jest.fn((userId: string) => ({
      title: "t",
      body: `hi ${userId}`,
    }));

    const result = await service.notifyUsers(
      ["u1", "u2"],
      "OFFER_FAVORITE",
      buildMessage,
    );

    expect(facade.sendBatch).toHaveBeenCalledWith([
      { to: "tok1", title: "t", body: "hi u1" },
      { to: "tok2", title: "t", body: "hi u2" },
    ]);
    expect(result).toEqual({ candidates: 2, denied: 0, sent: 1 });
  });

  it("sets disabledAt on every token the provider reports token_invalid — never deletes", async () => {
    const { prisma, facade, policy } = buildDeps();
    prisma.pushToken.findMany.mockResolvedValue([
      { userId: "u1", expoPushToken: "tok-dead" },
    ]);
    facade.sendBatch.mockResolvedValue([
      { to: "tok-dead", outcome: "token_invalid", error: "gone" },
    ]);
    const service = new PushDispatchService(
      prisma as any,
      facade as any,
      policy as any,
    );

    await service.notifyUsers(["u1"], "OFFER_FAVORITE", () => ({
      title: "t",
      body: "b",
    }));

    expect(prisma.pushToken.updateMany).toHaveBeenCalledWith({
      where: { expoPushToken: { in: ["tok-dead"] } },
      data: { disabledAt: expect.any(Date) },
    });
  });

  it("no live tokens for any allowed user -> no send call", async () => {
    const { prisma, facade, policy } = buildDeps();
    const service = new PushDispatchService(
      prisma as any,
      facade as any,
      policy as any,
    );

    const result = await service.notifyUsers(["u1"], "OFFER_FAVORITE", () => ({
      title: "t",
      body: "b",
    }));

    expect(facade.sendBatch).not.toHaveBeenCalled();
    expect(result).toEqual({ candidates: 1, denied: 0, sent: 0 });
  });
});
