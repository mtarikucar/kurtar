import { NotificationPolicyService } from "./notification-policy.service";

function buildPrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: "u1", status: "ACTIVE" }]),
    },
    notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

const NOON_ISTANBUL = new Date("2026-08-13T09:00:00.000Z"); // 12:00 Istanbul

describe("NotificationPolicyService.mayNotify — user status", () => {
  it("denies USER_NOT_FOUND when the user doesn't exist, without checking prefs", async () => {
    const prisma = buildPrisma({
      user: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decision = await service.mayNotify("nobody", "RESERVATION_CONFIRMED");

    expect(decision).toEqual({ allowed: false, reason: "USER_NOT_FOUND" });
    expect(prisma.notificationPreference.findMany).not.toHaveBeenCalled();
  });

  it.each(["BANNED", "DELETED"])(
    "denies USER_NOT_ACTIVE for status=%s, even for a transactional kind",
    async (status) => {
      const prisma = buildPrisma({
        user: { findMany: jest.fn().mockResolvedValue([{ id: "u1", status }]) },
      });
      const service = new NotificationPolicyService(prisma as any);

      const decision = await service.mayNotify("u1", "RESERVATION_CONFIRMED");

      expect(decision).toEqual({ allowed: false, reason: "USER_NOT_ACTIVE" });
    },
  );
});

describe("NotificationPolicyService.mayNotify — transactional bypass", () => {
  it.each([
    "RESERVATION_CONFIRMED",
    "RESERVATION_CANCELLED_REFUND",
    "PICKUP_REMINDER",
  ] as const)(
    "%s is allowed for an ACTIVE user regardless of preferences or quiet hours, and never reads the preference table",
    async (kind) => {
      const prisma = buildPrisma();
      const service = new NotificationPolicyService(prisma as any);

      const decision = await service.mayNotify("u1", kind, NOON_ISTANBUL);

      expect(decision).toEqual({ allowed: true });
      expect(prisma.notificationPreference.findMany).not.toHaveBeenCalled();
    },
  );
});

describe("NotificationPolicyService.mayNotify — non-transactional preference gating", () => {
  it("OFFER_FAVORITE denied when favoritesEnabled=false", async () => {
    const prisma = buildPrisma({
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: "u1",
            favoritesEnabled: false,
            nearbyEnabled: false,
            marketingEnabled: false,
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ]),
      },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decision = await service.mayNotify(
      "u1",
      "OFFER_FAVORITE",
      NOON_ISTANBUL,
    );

    expect(decision).toEqual({ allowed: false, reason: "PREFERENCE_DISABLED" });
  });

  it("OFFER_FAVORITE allowed by default (favoritesEnabled defaults true) when no preference row exists yet — and does NOT create one", async () => {
    const prisma = buildPrisma();
    const service = new NotificationPolicyService(prisma as any);

    const decision = await service.mayNotify(
      "u1",
      "OFFER_FAVORITE",
      NOON_ISTANBUL,
    );

    expect(decision).toEqual({ allowed: true });
    expect(prisma.notificationPreference.findMany).toHaveBeenCalledTimes(1);
  });

  it("OFFER_NEARBY denied by default (nearbyEnabled defaults false) when no preference row exists yet — opt-in, not opt-out", async () => {
    const prisma = buildPrisma();
    const service = new NotificationPolicyService(prisma as any);

    const decision = await service.mayNotify(
      "u1",
      "OFFER_NEARBY",
      NOON_ISTANBUL,
    );

    expect(decision).toEqual({ allowed: false, reason: "PREFERENCE_DISABLED" });
  });

  it("OFFER_NEARBY allowed when nearbyEnabled=true and outside quiet hours", async () => {
    const prisma = buildPrisma({
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: "u1",
            favoritesEnabled: true,
            nearbyEnabled: true,
            marketingEnabled: false,
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ]),
      },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decision = await service.mayNotify(
      "u1",
      "OFFER_NEARBY",
      NOON_ISTANBUL,
    );

    expect(decision).toEqual({ allowed: true });
  });

  it("RATING_INVITE has no dedicated preference toggle — allowed outside quiet hours regardless of favoritesEnabled/nearbyEnabled", async () => {
    const prisma = buildPrisma({
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: "u1",
            favoritesEnabled: false,
            nearbyEnabled: false,
            marketingEnabled: false,
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ]),
      },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decision = await service.mayNotify(
      "u1",
      "RATING_INVITE",
      NOON_ISTANBUL,
    );

    expect(decision).toEqual({ allowed: true });
  });
});

describe("NotificationPolicyService.mayNotify — quiet hours (non-transactional only)", () => {
  it("denies QUIET_HOURS for a non-transactional kind whose preference is enabled but the hour falls inside the window", async () => {
    const prisma = buildPrisma({
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: "u1",
            favoritesEnabled: true,
            nearbyEnabled: true,
            marketingEnabled: false,
            quietHoursStart: 9,
            quietHoursEnd: 18,
          },
        ]),
      },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decision = await service.mayNotify(
      "u1",
      "OFFER_FAVORITE",
      NOON_ISTANBUL,
    );

    expect(decision).toEqual({ allowed: false, reason: "QUIET_HOURS" });
  });

  it("allows a non-transactional kind outside the configured quiet-hours window", async () => {
    const elevenPmIstanbul = new Date("2026-08-13T20:00:00.000Z");
    const prisma = buildPrisma({
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: "u1",
            favoritesEnabled: true,
            nearbyEnabled: true,
            marketingEnabled: false,
            quietHoursStart: 9,
            quietHoursEnd: 18,
          },
        ]),
      },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decision = await service.mayNotify(
      "u1",
      "OFFER_FAVORITE",
      elevenPmIstanbul,
    );

    expect(decision).toEqual({ allowed: true });
  });

  it("a transactional kind ignores quiet hours entirely, even mid-window", async () => {
    const prisma = buildPrisma({
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: "u1",
            favoritesEnabled: true,
            nearbyEnabled: true,
            marketingEnabled: false,
            quietHoursStart: 0,
            quietHoursEnd: 23,
          },
        ]),
      },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decision = await service.mayNotify(
      "u1",
      "RESERVATION_CONFIRMED",
      NOON_ISTANBUL,
    );

    expect(decision).toEqual({ allowed: true });
  });
});

describe("NotificationPolicyService.mayNotifyBatch — batching (Important 5 fix)", () => {
  it("evaluates any number of userIds with exactly 2 DB calls total (one user.findMany, one notificationPreference.findMany)", async () => {
    const prisma = buildPrisma({
      user: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 50 }, (_, i) => ({
            id: `u${i}`,
            status: "ACTIVE",
          })),
        ),
      },
      notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const service = new NotificationPolicyService(prisma as any);
    const userIds = Array.from({ length: 50 }, (_, i) => `u${i}`);

    const decisions = await service.mayNotifyBatch(userIds, "OFFER_FAVORITE");

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notificationPreference.findMany).toHaveBeenCalledTimes(1);
    expect(decisions.size).toBe(50);
    expect([...decisions.values()].every((d) => d.allowed)).toBe(true);
  });

  it("a transactional kind skips the preference query entirely, even for a large batch", async () => {
    const prisma = buildPrisma({
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: "u1", status: "ACTIVE" },
          { id: "u2", status: "ACTIVE" },
        ]),
      },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decisions = await service.mayNotifyBatch(
      ["u1", "u2"],
      "RESERVATION_CONFIRMED",
    );

    expect(prisma.notificationPreference.findMany).not.toHaveBeenCalled();
    expect(decisions.get("u1")).toEqual({ allowed: true });
    expect(decisions.get("u2")).toEqual({ allowed: true });
  });

  it("mixed batch: not-found, banned, opted-out, and allowed users each get their own correct decision", async () => {
    const prisma = buildPrisma({
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: "u-banned", status: "BANNED" },
          { id: "u-optedout", status: "ACTIVE" },
          { id: "u-allowed", status: "ACTIVE" },
          // u-missing intentionally absent — simulates USER_NOT_FOUND
        ]),
      },
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: "u-optedout",
            favoritesEnabled: false,
            nearbyEnabled: false,
            marketingEnabled: false,
            quietHoursStart: null,
            quietHoursEnd: null,
          },
          {
            userId: "u-allowed",
            favoritesEnabled: true,
            nearbyEnabled: false,
            marketingEnabled: false,
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ]),
      },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decisions = await service.mayNotifyBatch(
      ["u-missing", "u-banned", "u-optedout", "u-allowed"],
      "OFFER_FAVORITE",
      NOON_ISTANBUL,
    );

    expect(decisions.get("u-missing")).toEqual({
      allowed: false,
      reason: "USER_NOT_FOUND",
    });
    expect(decisions.get("u-banned")).toEqual({
      allowed: false,
      reason: "USER_NOT_ACTIVE",
    });
    expect(decisions.get("u-optedout")).toEqual({
      allowed: false,
      reason: "PREFERENCE_DISABLED",
    });
    expect(decisions.get("u-allowed")).toEqual({ allowed: true });
    // The preference query is scoped to ACTIVE, non-transactional
    // candidates only — never u-banned/u-missing.
    expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u-optedout", "u-allowed"] } },
      select: expect.any(Object),
    });
  });

  it("deduplicates repeated userIds — one query row, one decision, regardless of how many times an id appears in the input", async () => {
    const prisma = buildPrisma({
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: "u1", status: "ACTIVE" }]),
      },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decisions = await service.mayNotifyBatch(
      ["u1", "u1", "u1"],
      "RESERVATION_CONFIRMED",
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["u1"] } },
      select: expect.any(Object),
    });
    expect(decisions.size).toBe(1);
  });

  it("an empty userIds array short-circuits without any DB call", async () => {
    const prisma = buildPrisma();
    const service = new NotificationPolicyService(prisma as any);

    const decisions = await service.mayNotifyBatch([], "OFFER_FAVORITE");

    expect(decisions.size).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
