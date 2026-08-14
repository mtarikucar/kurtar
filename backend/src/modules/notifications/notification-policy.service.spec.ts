import { NotificationPolicyService } from "./notification-policy.service";

function buildPrisma(overrides: Record<string, any> = {}) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE" }) },
    notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

const NOON_ISTANBUL = new Date("2026-08-13T09:00:00.000Z"); // 12:00 Istanbul

describe("NotificationPolicyService.mayNotify — user status", () => {
  it("denies USER_NOT_FOUND when the user doesn't exist, without checking prefs", async () => {
    const prisma = buildPrisma({
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const service = new NotificationPolicyService(prisma as any);

    const decision = await service.mayNotify("nobody", "RESERVATION_CONFIRMED");

    expect(decision).toEqual({ allowed: false, reason: "USER_NOT_FOUND" });
    expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled();
  });

  it.each(["BANNED", "DELETED"])(
    "denies USER_NOT_ACTIVE for status=%s, even for a transactional kind",
    async (status) => {
      const prisma = buildPrisma({
        user: { findUnique: jest.fn().mockResolvedValue({ status }) },
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
    "%s is allowed for an ACTIVE user regardless of preferences or quiet hours, and never reads the preference row",
    async (kind) => {
      const prisma = buildPrisma();
      const service = new NotificationPolicyService(prisma as any);

      const decision = await service.mayNotify("u1", kind, NOON_ISTANBUL);

      expect(decision).toEqual({ allowed: true });
      expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled();
    },
  );
});

describe("NotificationPolicyService.mayNotify — non-transactional preference gating", () => {
  it("OFFER_FAVORITE denied when favoritesEnabled=false", async () => {
    const prisma = buildPrisma({
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue({
          favoritesEnabled: false,
          nearbyEnabled: false,
          marketingEnabled: false,
          quietHoursStart: null,
          quietHoursEnd: null,
        }),
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
    expect(prisma.notificationPreference.findUnique).toHaveBeenCalledTimes(1);
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
        findUnique: jest.fn().mockResolvedValue({
          favoritesEnabled: true,
          nearbyEnabled: true,
          marketingEnabled: false,
          quietHoursStart: null,
          quietHoursEnd: null,
        }),
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
        findUnique: jest.fn().mockResolvedValue({
          favoritesEnabled: false,
          nearbyEnabled: false,
          marketingEnabled: false,
          quietHoursStart: null,
          quietHoursEnd: null,
        }),
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
        findUnique: jest.fn().mockResolvedValue({
          favoritesEnabled: true,
          nearbyEnabled: true,
          marketingEnabled: false,
          quietHoursStart: 9,
          quietHoursEnd: 18,
        }),
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
        findUnique: jest.fn().mockResolvedValue({
          favoritesEnabled: true,
          nearbyEnabled: true,
          marketingEnabled: false,
          quietHoursStart: 9,
          quietHoursEnd: 18,
        }),
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
        findUnique: jest.fn().mockResolvedValue({
          favoritesEnabled: true,
          nearbyEnabled: true,
          marketingEnabled: false,
          quietHoursStart: 0,
          quietHoursEnd: 23,
        }),
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
