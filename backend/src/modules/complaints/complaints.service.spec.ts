import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AuthenticatedPrincipal } from "../auth/strategies/jwt.strategy";
import { ComplaintsService } from "./complaints.service";

// Only exercised by the "ComplaintsService.adminRefund" describe block
// below — every other suite in this file constructs ComplaintsService
// with this as a harmless no-op stand-in for its second dependency.
function buildReservationsMock(overrides: Record<string, any> = {}) {
  return { refundRedeemed: jest.fn(), ...overrides };
}

function buildFakeTx(overrides: Record<string, any> = {}) {
  return {
    complaintMessage: { create: jest.fn(), ...overrides.complaintMessage },
    complaintTicket: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      ...overrides.complaintTicket,
    },
    auditLog: { create: jest.fn(), ...overrides.auditLog },
  };
}

function buildDeps(overrides: Record<string, any> = {}) {
  const tx = buildFakeTx(overrides.tx);
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    reservation: { findUnique: jest.fn(), ...overrides.reservation },
    merchant: { findUnique: jest.fn(), ...overrides.merchant },
    complaintTicket: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...overrides.complaintTicketRoot,
    },
    auditLog: { create: jest.fn(), ...overrides.auditLogRoot },
  };
  return { tx, prisma };
}

function user(
  overrides: Partial<AuthenticatedPrincipal> = {},
): AuthenticatedPrincipal {
  return { id: "u1", actor: "CONSUMER", ...overrides };
}

describe("ComplaintsService.create", () => {
  it("derives merchantId from the reservation, overriding any client-supplied merchantId", async () => {
    const { prisma } = buildDeps({
      reservation: {
        findUnique: jest.fn().mockResolvedValue({
          id: "resv1",
          userId: "u1",
          store: { merchantId: "real-merchant" },
        }),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await service.create("u1", {
      category: "FOOD_QUALITY",
      description: "Soğuktu",
      reservationId: "resv1",
      merchantId: "spoofed-merchant",
    });
    expect(prisma.complaintTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId: "real-merchant",
        reservationId: "resv1",
      }),
    });
  });

  it("rejects a reservation belonging to a different user", async () => {
    const { prisma } = buildDeps({
      reservation: {
        findUnique: jest.fn().mockResolvedValue({
          id: "resv1",
          userId: "someone-else",
          store: { merchantId: "m1" },
        }),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await expect(
      service.create("u1", {
        category: "OTHER",
        description: "x",
        reservationId: "resv1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("a standalone merchantId (no reservation) is validated against the merchant table", async () => {
    const { prisma } = buildDeps({
      merchant: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await expect(
      service.create("u1", {
        category: "OTHER",
        description: "x",
        merchantId: "missing",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("neither reservationId nor merchantId is a valid platform-level complaint", async () => {
    const { prisma } = buildDeps();
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await service.create("u1", { category: "OTHER", description: "x" });
    expect(prisma.complaintTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ merchantId: null, reservationId: null }),
    });
  });
});

describe("ComplaintsService.addMessage — authorization matrix (who may post to which thread)", () => {
  const complaint = { id: "c1", userId: "owner-1", merchantId: "merchant-1" };

  it("CONSUMER who owns the complaint may post", async () => {
    const { tx, prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue(complaint),
      },
    });
    tx.complaintMessage.create.mockResolvedValue({ id: "m1" });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await expect(
      service.addMessage(
        user({ id: "owner-1", actor: "CONSUMER" }),
        "c1",
        "hi",
      ),
    ).resolves.toBeDefined();
    // Consumer message never flips status.
    expect(tx.complaintTicket.updateMany).not.toHaveBeenCalled();
  });

  it("CONSUMER who does NOT own the complaint is denied", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue(complaint),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await expect(
      service.addMessage(
        user({ id: "someone-else", actor: "CONSUMER" }),
        "c1",
        "hi",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("MERCHANT assigned to the complaint may post, and it flips OPEN -> MERCHANT_RESPONDED", async () => {
    const { tx, prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue(complaint),
      },
    });
    tx.complaintMessage.create.mockResolvedValue({ id: "m1" });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await service.addMessage(
      user({ id: "mu1", actor: "MERCHANT", merchantId: "merchant-1" }),
      "c1",
      "reply",
    );
    expect(tx.complaintTicket.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", status: { in: ["OPEN"] } },
      data: { status: "MERCHANT_RESPONDED" },
    });
  });

  it("MERCHANT NOT assigned to the complaint is denied", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue(complaint),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await expect(
      service.addMessage(
        user({ id: "mu2", actor: "MERCHANT", merchantId: "other-merchant" }),
        "c1",
        "reply",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("MERCHANT is denied on a complaint with NO merchantId at all (a platform-level complaint)", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "c2", userId: "owner-1", merchantId: null }),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await expect(
      service.addMessage(
        user({ id: "mu1", actor: "MERCHANT", merchantId: "merchant-1" }),
        "c2",
        "reply",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("ADMIN may post to any thread, regardless of ownership/assignment", async () => {
    const { tx, prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue(complaint),
      },
    });
    tx.complaintMessage.create.mockResolvedValue({ id: "m1" });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await expect(
      service.addMessage(
        user({ id: "admin-1", actor: "ADMIN" }),
        "c1",
        "we're on it",
      ),
    ).resolves.toBeDefined();
  });

  it("404s on a nonexistent complaint before any authorization check runs", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );
    await expect(
      service.addMessage(
        user({ id: "admin-1", actor: "ADMIN" }),
        "missing",
        "hi",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ComplaintsService admin transitions", () => {
  it("adminResolve stamps resolvedAt and writes an AuditLog row", async () => {
    const { tx, prisma } = buildDeps();
    tx.complaintTicket.findUnique.mockResolvedValue({
      id: "c1",
      status: "OPEN",
    });
    tx.complaintTicket.findUniqueOrThrow.mockResolvedValue({
      id: "c1",
      status: "RESOLVED",
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );

    await service.adminResolve("admin1", "c1", "handled");

    expect(tx.complaintTicket.updateMany).toHaveBeenCalledWith({
      where: {
        id: "c1",
        status: {
          in: expect.arrayContaining([
            "OPEN",
            "MERCHANT_RESPONDED",
            "ESCALATED",
          ]),
        },
      },
      data: expect.objectContaining({
        status: "RESOLVED",
        resolvedAt: expect.any(Date),
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "complaint.resolve",
        entity: "ComplaintTicket",
        entityId: "c1",
      }),
    });
  });

  it("adminEscalate on an already-RESOLVED complaint throws COMPLAINT_TRANSITION_INVALID (409)", async () => {
    const { tx, prisma } = buildDeps();
    tx.complaintTicket.findUnique.mockResolvedValue({
      id: "c1",
      status: "RESOLVED",
    });
    tx.complaintTicket.updateMany.mockResolvedValue({ count: 0 });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );

    const err = await service
      .adminEscalate("admin1", "c1", undefined)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response.errorCode).toBe("COMPLAINT_TRANSITION_INVALID");
  });
});

describe("ComplaintsService.adminList — filters", () => {
  it("[Important 3] the category filter is genuinely applied to the query, not silently dropped", async () => {
    const { prisma } = buildDeps();
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );

    await service.adminList("OPEN", "merchant-1", "SAFETY_HYGIENE", 1, 20);

    expect(prisma.complaintTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "OPEN",
          merchantId: "merchant-1",
          category: "SAFETY_HYGIENE",
        },
      }),
    );
    expect(prisma.complaintTicket.count).toHaveBeenCalledWith({
      where: {
        status: "OPEN",
        merchantId: "merchant-1",
        category: "SAFETY_HYGIENE",
      },
    });
  });

  it("omits the category key entirely when not provided (never filters on an undefined value)", async () => {
    const { prisma } = buildDeps();
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );

    await service.adminList(undefined, undefined, undefined, 1, 20);

    expect(prisma.complaintTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

// [I18 fix] The merchant-scoped read that used to not exist at all —
// merchant-web called the CONSUMER-only getMine equivalent and got 403'd
// on every ticket (see complaints.controller.ts's class-level
// @Actors("CONSUMER")).
describe("ComplaintsService.getAssigned", () => {
  it("returns the complaint (with messages) when it IS assigned to the caller's merchant", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "c1",
          merchantId: "merchant-1",
          messages: [],
        }),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );

    await expect(service.getAssigned("merchant-1", "c1")).resolves.toEqual(
      expect.objectContaining({ id: "c1", merchantId: "merchant-1" }),
    );
  });

  it("denies a complaint assigned to a DIFFERENT merchant (403, not a leak)", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "c1",
          merchantId: "other-merchant",
          messages: [],
        }),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );

    await expect(
      service.getAssigned("merchant-1", "c1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("denies a platform-level complaint with no merchantId at all", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "c1", merchantId: null, messages: [] }),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );

    await expect(
      service.getAssigned("merchant-1", "c1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("404s on a nonexistent complaint", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );

    await expect(
      service.getAssigned("merchant-1", "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// [I3 fix] adminRefund — the only production entry point for refunding a
// REDEEMED reservation.
describe("ComplaintsService.adminRefund", () => {
  it("claims the ticket, calls ReservationsService.refundRedeemed, and writes an AuditLog row on success", async () => {
    const refundRedeemed = jest.fn().mockResolvedValue({
      reservationId: "resv1",
      ok: true,
      refundRef: "mock-refund-1",
    });
    const { prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "c1",
          reservationId: "resv1",
          refundedAt: null,
        }),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock({ refundRedeemed }) as any,
    );

    const result = await service.adminRefund("admin1", "c1");

    expect(prisma.complaintTicket.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", refundedAt: null },
      data: { refundedAt: expect.any(Date) },
    });
    expect(refundRedeemed).toHaveBeenCalledWith("resv1");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "complaint.refund",
        entity: "ComplaintTicket",
        entityId: "c1",
        diffJson: expect.objectContaining({
          reservationId: "resv1",
          refundRef: "mock-refund-1",
        }),
      }),
    });
    expect(result).toEqual({
      reservationId: "resv1",
      ok: true,
      refundRef: "mock-refund-1",
    });
  });

  it("404s when the complaint doesn't exist", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );

    await expect(
      service.adminRefund("admin1", "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("409s when the complaint has no linked reservation, without ever claiming the ticket", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "c1",
          reservationId: null,
          refundedAt: null,
        }),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock() as any,
    );

    const err = await service.adminRefund("admin1", "c1").catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response.errorCode).toBe("COMPLAINT_NO_RESERVATION");
    expect(prisma.complaintTicket.updateMany).not.toHaveBeenCalled();
  });

  it("409s (COMPLAINT_ALREADY_REFUNDED) when the ticket already triggered a refund — the single-fire guard", async () => {
    const { prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "c1",
          reservationId: "resv1",
          refundedAt: new Date(),
        }),
      },
    });
    // The guarded updateMany's WHERE (refundedAt: null) no longer matches.
    prisma.complaintTicket.updateMany = jest
      .fn()
      .mockResolvedValue({ count: 0 });
    const refundRedeemed = jest.fn();
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock({ refundRedeemed }) as any,
    );

    const err = await service.adminRefund("admin1", "c1").catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response.errorCode).toBe("COMPLAINT_ALREADY_REFUNDED");
    expect(refundRedeemed).not.toHaveBeenCalled();
  });

  it("releases the ticket-level claim (refundedAt back to NULL) and writes no AuditLog when the provider refund itself fails", async () => {
    const refundRedeemed = jest.fn().mockResolvedValue({
      reservationId: "resv1",
      ok: false,
      error: "provider down",
    });
    const { prisma } = buildDeps({
      complaintTicketRoot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "c1",
          reservationId: "resv1",
          refundedAt: null,
        }),
      },
    });
    const service = new ComplaintsService(
      prisma as any,
      buildReservationsMock({ refundRedeemed }) as any,
    );

    const result = await service.adminRefund("admin1", "c1");

    expect(result).toEqual({
      reservationId: "resv1",
      ok: false,
      error: "provider down",
    });
    expect(prisma.complaintTicket.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", refundedAt: { not: null } },
      data: { refundedAt: null },
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
