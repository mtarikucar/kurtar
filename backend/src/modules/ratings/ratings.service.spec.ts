import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { RatingsService } from "./ratings.service";

function uniqueReservationIdViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.0",
    meta: { target: ["reservationId"] },
  });
}

function buildFakeTx(overrides: Record<string, any> = {}) {
  return {
    rating: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _avg: { overallStars: 4 }, _count: { _all: 1 } }),
      ...overrides.rating,
    },
    store: { update: jest.fn(), ...overrides.store },
    auditLog: { create: jest.fn(), ...overrides.auditLog },
  };
}

function buildPrisma(overrides: Record<string, any> = {}) {
  const tx = buildFakeTx(overrides.tx);
  return {
    tx,
    prisma: {
      $transaction: jest.fn((cb: any) => cb(tx)),
      reservation: { findUnique: jest.fn(), ...overrides.reservation },
      store: { findUnique: jest.fn(), ...overrides.store },
      rating: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        ...overrides.ratingRoot,
      },
    },
  };
}

const eligibleReservation = {
  id: "resv1",
  userId: "u1",
  storeId: "store1",
  status: "REDEEMED",
};

describe("RatingsService.create — eligibility matrix", () => {
  it("REJECTS a reservation that doesn't exist", async () => {
    const { prisma } = buildPrisma();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new RatingsService(prisma as any);
    await expect(
      service.create("u1", "missing", { overallStars: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("REJECTS rating someone else's reservation", async () => {
    const { prisma } = buildPrisma();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue({
      ...eligibleReservation,
      userId: "someone-else",
    });
    const service = new RatingsService(prisma as any);
    await expect(
      service.create("u1", "resv1", { overallStars: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    "PENDING_PAYMENT",
    "CONFIRMED",
    "CANCELLED_BY_USER",
    "EXPIRED",
    "NO_SHOW",
  ])(
    "REJECTS a reservation in status %s (only REDEEMED is eligible)",
    async (status) => {
      const { prisma } = buildPrisma();
      (prisma.reservation.findUnique as jest.Mock).mockResolvedValue({
        ...eligibleReservation,
        status,
      });
      const service = new RatingsService(prisma as any);
      const err = await service
        .create("u1", "resv1", { overallStars: 5 })
        .catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.response.errorCode).toBe("RATING_NOT_ELIGIBLE");
    },
  );

  it("ACCEPTS a REDEEMED, own reservation and auto-APPROVES when comment is empty", async () => {
    const { prisma, tx } = buildPrisma();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      eligibleReservation,
    );
    tx.rating.create.mockResolvedValue({
      id: "r1",
      moderationStatus: "APPROVED",
    });
    const service = new RatingsService(prisma as any);

    await service.create("u1", "resv1", { overallStars: 5 });

    expect(tx.rating.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationStatus: "APPROVED",
        comment: null,
      }),
    });
    // Auto-approved -> the store aggregate is recomputed in the same tx.
    expect(tx.rating.aggregate).toHaveBeenCalled();
    expect(tx.store.update).toHaveBeenCalled();
  });

  it("a non-empty comment starts PENDING and does NOT touch the store aggregate yet", async () => {
    const { prisma, tx } = buildPrisma();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      eligibleReservation,
    );
    tx.rating.create.mockResolvedValue({
      id: "r1",
      moderationStatus: "PENDING",
    });
    const service = new RatingsService(prisma as any);

    await service.create("u1", "resv1", {
      overallStars: 4,
      comment: "  Harika!  ",
    });

    expect(tx.rating.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationStatus: "PENDING",
        comment: "Harika!",
      }),
    });
    expect(tx.rating.aggregate).not.toHaveBeenCalled();
    expect(tx.store.update).not.toHaveBeenCalled();
  });

  it("a whitespace-only comment is treated as empty (trimmed, auto-APPROVED)", async () => {
    const { prisma, tx } = buildPrisma();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      eligibleReservation,
    );
    tx.rating.create.mockResolvedValue({
      id: "r1",
      moderationStatus: "APPROVED",
    });
    const service = new RatingsService(prisma as any);

    await service.create("u1", "resv1", { overallStars: 5, comment: "   " });

    expect(tx.rating.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationStatus: "APPROVED",
        comment: null,
      }),
    });
  });

  it("surfaces a duplicate rating (unique reservationId race) as a friendly 409, not a raw 500", async () => {
    const { prisma, tx } = buildPrisma();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      eligibleReservation,
    );
    tx.rating.create.mockRejectedValue(uniqueReservationIdViolation());
    const service = new RatingsService(prisma as any);

    const err = await service
      .create("u1", "resv1", { overallStars: 5 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response.errorCode).toBe("RATING_ALREADY_EXISTS");
  });
});

describe("RatingsService moderation", () => {
  it("adminApprove is idempotent when already APPROVED — no duplicate aggregate recompute", async () => {
    const { prisma, tx } = buildPrisma();
    tx.rating.findUnique.mockResolvedValue({
      id: "r1",
      storeId: "s1",
      moderationStatus: "APPROVED",
    });
    const service = new RatingsService(prisma as any);
    await service.adminApprove("admin1", "r1");
    expect(tx.rating.update).not.toHaveBeenCalled();
    expect(tx.rating.aggregate).not.toHaveBeenCalled();
  });

  it("rejectRating moves PENDING -> REJECTED, recomputes the aggregate, and writes an AuditLog row", async () => {
    const { prisma, tx } = buildPrisma();
    tx.rating.findUnique.mockResolvedValue({
      id: "r1",
      storeId: "s1",
      moderationStatus: "PENDING",
    });
    tx.rating.update.mockResolvedValue({
      id: "r1",
      moderationStatus: "REJECTED",
    });
    const service = new RatingsService(prisma as any);

    await service.rejectRating("admin1", "r1");

    expect(tx.rating.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { moderationStatus: "REJECTED" },
    });
    expect(tx.store.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { avgStars: 4, ratingCount: 1 },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: "ADMIN",
        actorId: "admin1",
        action: "rating.reject",
        entity: "Rating",
        entityId: "r1",
      }),
    });
  });

  it("adminDelete removes the row and recomputes the aggregate", async () => {
    const { prisma, tx } = buildPrisma();
    tx.rating.findUnique.mockResolvedValue({
      id: "r1",
      storeId: "s1",
      moderationStatus: "APPROVED",
    });
    const service = new RatingsService(prisma as any);

    await service.adminDelete("admin1", "r1");

    expect(tx.rating.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
    expect(tx.store.update).toHaveBeenCalled();
  });
});

describe("RatingsService.listMine — merchant ownership", () => {
  it("throws FORBIDDEN when the store belongs to a different merchant", async () => {
    const { prisma } = buildPrisma();
    (prisma.store.findUnique as jest.Mock).mockResolvedValue({
      merchantId: "other-merchant",
      avgStars: 0,
      ratingCount: 0,
    });
    const service = new RatingsService(prisma as any);
    await expect(
      service.listMine("merchant1", "store1", 1, 20),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
