import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AuthenticatedPrincipal } from "../auth/strategies/jwt.strategy";
import { ComplaintsService } from "./complaints.service";

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
      ...overrides.complaintTicketRoot,
    },
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);
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
    const service = new ComplaintsService(prisma as any);

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
    const service = new ComplaintsService(prisma as any);

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
    const service = new ComplaintsService(prisma as any);

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
    const service = new ComplaintsService(prisma as any);

    await service.adminList(undefined, undefined, undefined, 1, 20);

    expect(prisma.complaintTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});
