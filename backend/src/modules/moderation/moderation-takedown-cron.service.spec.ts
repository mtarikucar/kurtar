import { Logger } from "@nestjs/common";
import { ModerationTakedownCronService } from "./moderation-takedown-cron.service";

function buildDeps(overrides: Record<string, any> = {}) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...overrides.prisma,
  };
  const email = {
    sendEmail: jest.fn().mockResolvedValue(true),
    ...overrides.email,
  };
  const config = {
    get: jest.fn().mockReturnValue("ops@example.test"),
    ...overrides.config,
  };
  return { prisma, email, config };
}

describe("ModerationTakedownCronService.runOnce — [Fix round, Important 8] branch isolation", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("a throwing digest email in the WARN branch does not suppress the BREACH branch's error log or its own digest attempt", async () => {
    const { prisma, email, config } = buildDeps({
      prisma: {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "r-warn-1",
              targetType: "OFFER",
              targetId: "o1",
              takedownDeadlineAt: new Date(),
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "r-breach-1",
              targetType: "STORE",
              targetId: "s1",
              takedownDeadlineAt: new Date(),
            },
          ]),
      },
      email: {
        sendEmail: jest
          .fn()
          .mockRejectedValueOnce(new Error("template compile failed"))
          .mockResolvedValueOnce(true),
      },
    });
    const service = new ModerationTakedownCronService(
      prisma as any,
      email as any,
      config as any,
    );

    const result = await service.runOnce(new Date());

    expect(result).toEqual({ warnedCount: 1, breachedCount: 1 });
    expect(email.sendEmail).toHaveBeenCalledTimes(2);

    const errorMessages = errorSpy.mock.calls.map((call) => call[0]);
    expect(errorMessages.some((m) => String(m).includes("r-warn-1"))).toBe(
      true,
    );
    expect(errorMessages.some((m) => String(m).includes("r-breach-1"))).toBe(
      true,
    );
  });

  it("runCron catches a runOnce failure and logs it rather than propagating", async () => {
    const { prisma, email, config } = buildDeps({
      prisma: { $queryRaw: jest.fn().mockRejectedValue(new Error("db blip")) },
    });
    const service = new ModerationTakedownCronService(
      prisma as any,
      email as any,
      config as any,
    );

    await expect(service.runCron()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("db blip"),
      expect.anything(),
    );
  });
});
