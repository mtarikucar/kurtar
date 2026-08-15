import { ConflictException, NotFoundException } from "@nestjs/common";
import { ModerationService } from "./moderation.service";

function buildFakeTx(overrides: Record<string, any> = {}) {
  return {
    contentReport: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      ...overrides.contentReport,
    },
    auditLog: { create: jest.fn(), ...overrides.auditLog },
  };
}

function buildDeps(overrides: Record<string, any> = {}) {
  const tx = buildFakeTx(overrides.tx);
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    contentReport: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      ...overrides.contentReportRoot,
    },
  };
  const ratings = {
    rejectRating: jest.fn().mockResolvedValue({}),
    ...overrides.ratings,
  };
  const stores = {
    adminDeactivate: jest.fn().mockResolvedValue({}),
    ...overrides.stores,
  };
  const offers = {
    adminCancel: jest.fn().mockResolvedValue({}),
    ...overrides.offers,
  };
  return { tx, prisma, ratings, stores, offers };
}

function buildService(deps: ReturnType<typeof buildDeps>) {
  return new ModerationService(
    deps.prisma as any,
    deps.ratings as any,
    deps.stores as any,
    deps.offers as any,
  );
}

describe("ModerationService.adminAction — dispatches to the ONE reused entry point per target type", () => {
  it("RATING -> RatingsService.rejectRating", async () => {
    const deps = buildDeps({
      contentReportRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "r1",
          status: "OPEN",
          targetType: "RATING",
          targetId: "rating-1",
        }),
      },
    });
    deps.tx.contentReport.findUniqueOrThrow.mockResolvedValue({
      id: "r1",
      status: "ACTIONED",
    });
    const service = buildService(deps);

    await service.adminAction("admin1", "r1", undefined);

    expect(deps.ratings.rejectRating).toHaveBeenCalledWith(
      "admin1",
      "rating-1",
    );
    expect(deps.stores.adminDeactivate).not.toHaveBeenCalled();
    expect(deps.offers.adminCancel).not.toHaveBeenCalled();
  });

  it("STORE -> StoresService.adminDeactivate", async () => {
    const deps = buildDeps({
      contentReportRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "r1",
          status: "OPEN",
          targetType: "STORE",
          targetId: "store-1",
        }),
      },
    });
    deps.tx.contentReport.findUniqueOrThrow.mockResolvedValue({
      id: "r1",
      status: "ACTIONED",
    });
    const service = buildService(deps);

    await service.adminAction("admin1", "r1", undefined);

    expect(deps.stores.adminDeactivate).toHaveBeenCalledWith(
      "admin1",
      "store-1",
    );
  });

  it("OFFER -> OffersService.adminCancel (the Task 5 fan-out entry point, never a second copy)", async () => {
    const deps = buildDeps({
      contentReportRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "r1",
          status: "OPEN",
          targetType: "OFFER",
          targetId: "offer-1",
        }),
      },
    });
    deps.tx.contentReport.findUniqueOrThrow.mockResolvedValue({
      id: "r1",
      status: "ACTIONED",
    });
    const service = buildService(deps);

    await service.adminAction("admin1", "r1", undefined);

    expect(deps.offers.adminCancel).toHaveBeenCalledWith("admin1", "offer-1");
  });

  it("throws REPORT_ALREADY_HANDLED (409) on a non-OPEN report, without touching any target service", async () => {
    const deps = buildDeps({
      contentReportRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "r1",
          status: "DISMISSED",
          targetType: "OFFER",
          targetId: "offer-1",
        }),
      },
    });
    const service = buildService(deps);

    const err = await service
      .adminAction("admin1", "r1", undefined)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response.errorCode).toBe("REPORT_ALREADY_HANDLED");
    expect(deps.offers.adminCancel).not.toHaveBeenCalled();
  });

  it("404s on a nonexistent report", async () => {
    const deps = buildDeps({
      contentReportRoot: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const service = buildService(deps);
    await expect(
      service.adminAction("admin1", "missing", undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("if the target mutation throws, the report is NEVER claimed as ACTIONED", async () => {
    const deps = buildDeps({
      contentReportRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "r1",
          status: "OPEN",
          targetType: "OFFER",
          targetId: "offer-1",
        }),
      },
      offers: {
        adminCancel: jest
          .fn()
          .mockRejectedValue(new ConflictException("already terminal")),
      },
    });
    const service = buildService(deps);

    await expect(
      service.adminAction("admin1", "r1", undefined),
    ).rejects.toBeInstanceOf(ConflictException);
    // The claim transaction (updateMany -> ACTIONED) is never reached.
    expect(deps.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("ModerationService.adminDismiss", () => {
  it("moves OPEN -> DISMISSED and writes an AuditLog row, without touching any target service", async () => {
    const deps = buildDeps();
    deps.tx.contentReport.findUnique.mockResolvedValue({
      id: "r1",
      status: "OPEN",
    });
    deps.tx.contentReport.findUniqueOrThrow.mockResolvedValue({
      id: "r1",
      status: "DISMISSED",
    });
    const service = buildService(deps);

    await service.adminDismiss("admin1", "r1", "not a real issue");

    expect(deps.tx.contentReport.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({ status: "DISMISSED" }),
    });
    expect(deps.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "report.dismiss",
        entity: "ContentReport",
        entityId: "r1",
      }),
    });
    expect(deps.ratings.rejectRating).not.toHaveBeenCalled();
    expect(deps.stores.adminDeactivate).not.toHaveBeenCalled();
    expect(deps.offers.adminCancel).not.toHaveBeenCalled();
  });

  it("throws REPORT_ALREADY_HANDLED (409) on an already-ACTIONED report", async () => {
    const deps = buildDeps();
    deps.tx.contentReport.findUnique.mockResolvedValue({
      id: "r1",
      status: "ACTIONED",
    });
    const service = buildService(deps);

    const err = await service
      .adminDismiss("admin1", "r1", undefined)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response.errorCode).toBe("REPORT_ALREADY_HANDLED");
  });
});
