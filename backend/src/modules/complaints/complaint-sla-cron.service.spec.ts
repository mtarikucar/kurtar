import { Logger } from "@nestjs/common";
import { ComplaintSlaCronService } from "./complaint-sla-cron.service";

function buildDeps(overrides: Record<string, any> = {}) {
  const tx = {
    $queryRaw: jest.fn(),
    auditLog: { createMany: jest.fn() },
    ...overrides.tx,
  };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((cb: any) => cb(tx)),
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
  return { tx, prisma, email, config };
}

describe("ComplaintSlaCronService.runOnce — [Fix round, Important 8] branch isolation", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("a throwing digest email in the WARN branch does not suppress the BREACH branch's error log, escalation, or its own digest attempt", async () => {
    const { tx, prisma, email, config } = buildDeps({
      prisma: {
        // warnApproaching's raw query -> one approaching complaint.
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            { id: "c-warn-1", category: "OTHER", slaDeadlineAt: new Date() },
          ]),
      },
      tx: {
        // escalateBreached's raw query (inside $transaction) -> one breach.
        $queryRaw: jest.fn().mockResolvedValue([{ id: "c-breach-1" }]),
      },
      email: {
        // FIRST call (the WARN digest) throws outright — exactly what
        // EmailService.sendEmail does on a template-compile failure, per
        // the review's finding (not just a `false` return).
        sendEmail: jest
          .fn()
          .mockRejectedValueOnce(new Error("template compile failed"))
          .mockResolvedValueOnce(true),
      },
    });
    const service = new ComplaintSlaCronService(
      prisma as any,
      email as any,
      config as any,
    );

    const result = await service.runOnce(new Date());

    // Both branches' DB work happened.
    expect(result).toEqual({ warnedCount: 1, escalatedCount: 1 });
    expect(tx.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          entity: "ComplaintTicket",
          entityId: "c-breach-1",
          action: "complaint.sla_breach_escalate",
        }),
      ],
    });

    // BOTH digest sends were attempted — the breach branch's send was
    // NOT skipped just because the warn branch's send threw first.
    expect(email.sendEmail).toHaveBeenCalledTimes(2);

    // BOTH error logs ran (the "never silently pass a deadline" record),
    // not just the warn branch's.
    const errorMessages = errorSpy.mock.calls.map((call) => call[0]);
    expect(errorMessages.some((m) => String(m).includes("c-warn-1"))).toBe(
      true,
    );
    expect(errorMessages.some((m) => String(m).includes("c-breach-1"))).toBe(
      true,
    );

    // runOnce itself never threw despite the email rejection.
  });

  it("runCron catches a runOnce failure and logs it rather than propagating", async () => {
    const { prisma, email, config } = buildDeps({
      prisma: { $queryRaw: jest.fn().mockRejectedValue(new Error("db blip")) },
    });
    const service = new ComplaintSlaCronService(
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
