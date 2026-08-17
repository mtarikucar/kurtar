import { NotFoundException } from "@nestjs/common";
import { MerchantsService } from "./merchants.service";

/**
 * [Admin KYC detail] Unit coverage for MerchantsService.adminGetDetail —
 * the audit-write, the docsJson derivation (most recent non-null among
 * verificationEvents), and the full-IBAN pass-through. See
 * adminGetDetail's own doc comment in merchants.service.ts for the
 * masking/audit design rationale this proves.
 */
function buildDeps(merchantRow: unknown) {
  const tx = {
    merchant: { findUnique: jest.fn().mockResolvedValue(merchantRow) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
  return { tx, prisma };
}

function buildService(prisma: unknown) {
  // Only prisma is exercised by adminGetDetail — the other three
  // constructor deps (tokenService/offersService/outbox) are never
  // touched by this method.
  return new MerchantsService(prisma as any, {} as any, {} as any, {} as any);
}

function sampleMerchantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    legalName: "Test Gıda Ltd. Şti.",
    tradeName: "Test Fırın",
    taxId: "1234567890",
    mersisNo: "0123456789012345",
    kepAddress: "test@hs01.kep.tr",
    iban: "TR330006100519786457841326",
    verificationStatus: "SUBMITTED",
    verifiedAt: null,
    nextReverifyAt: null,
    sttAttestationAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
    intermediationAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
    intermediationContractVersion: "v1",
    verificationEvents: [
      {
        id: "e1",
        fromStatus: "DRAFT",
        toStatus: "SUBMITTED",
        actorAdminId: null,
        note: null,
        docsJson: { taxCertificateUrl: "https://cdn.example/tax.pdf" },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    ...overrides,
  };
}

describe("MerchantsService.adminGetDetail", () => {
  it("returns the full KYC detail — full IBAN, taxId, mersisNo, kepAddress, attestation timestamps, nextReverifyAt", async () => {
    const { prisma } = buildDeps(sampleMerchantRow());
    const service = buildService(prisma);

    const result = await service.adminGetDetail("admin1", "m1");

    expect(result.iban).toBe("TR330006100519786457841326");
    expect(result.taxId).toBe("1234567890");
    expect(result.mersisNo).toBe("0123456789012345");
    expect(result.kepAddress).toBe("test@hs01.kep.tr");
    expect(result.sttAttestationAcceptedAt).toEqual(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(result.intermediationContractVersion).toBe("v1");
  });

  it("returns the full verification-event history, not just the latest", async () => {
    const row = sampleMerchantRow({
      verificationEvents: [
        {
          id: "e1",
          fromStatus: "DRAFT",
          toStatus: "SUBMITTED",
          actorAdminId: null,
          note: null,
          docsJson: { v: 1 },
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "e2",
          fromStatus: "SUBMITTED",
          toStatus: "REJECTED",
          actorAdminId: "admin-old",
          note: "taxId mismatch",
          docsJson: null,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
        {
          id: "e3",
          fromStatus: "REJECTED",
          toStatus: "SUBMITTED",
          actorAdminId: null,
          note: null,
          docsJson: { v: 2 },
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
        },
      ],
    });
    const { prisma } = buildDeps(row);
    const service = buildService(prisma);

    const result = await service.adminGetDetail("admin1", "m1");

    expect(result.verificationEvents).toHaveLength(3);
    expect(result.verificationEvents.map((e) => e.id)).toEqual([
      "e1",
      "e2",
      "e3",
    ]);
    expect(result.verificationEvents[1]).toMatchObject({
      toStatus: "REJECTED",
      actorAdminId: "admin-old",
      note: "taxId mismatch",
      docsJson: null,
    });
  });

  it("derives the top-level docsJson as the MOST RECENT non-null event's docsJson, not the first", async () => {
    const row = sampleMerchantRow({
      verificationEvents: [
        {
          id: "e1",
          fromStatus: "DRAFT",
          toStatus: "SUBMITTED",
          actorAdminId: null,
          note: null,
          docsJson: { round: "first-submission" },
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "e2",
          fromStatus: "SUBMITTED",
          toStatus: "REJECTED",
          actorAdminId: "admin-old",
          note: "blurry photo",
          docsJson: null,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
        {
          id: "e3",
          fromStatus: "REJECTED",
          toStatus: "SUBMITTED",
          actorAdminId: null,
          note: null,
          docsJson: { round: "resubmission" },
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
        },
      ],
    });
    const { prisma } = buildDeps(row);
    const service = buildService(prisma);

    const result = await service.adminGetDetail("admin1", "m1");

    expect(result.docsJson).toEqual({ round: "resubmission" });
  });

  it("docsJson is null when the merchant has never submitted (still DRAFT, no events with any docsJson)", async () => {
    const row = sampleMerchantRow({
      verificationStatus: "DRAFT",
      verificationEvents: [],
    });
    const { prisma } = buildDeps(row);
    const service = buildService(prisma);

    const result = await service.adminGetDetail("admin1", "m1");

    expect(result.docsJson).toBeNull();
  });

  it("throws MERCHANT_NOT_FOUND for a nonexistent merchant, and never writes an audit row for a failed read", async () => {
    const { tx, prisma } = buildDeps(null);
    const service = buildService(prisma);

    await expect(
      service.adminGetDetail("admin1", "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  // [Audit trail] The whole point of auditing this read: there must be a
  // durable record of WHICH admin looked at WHICH merchant's KYC
  // material, and WHEN — every call writes its own row, never
  // deduplicated across admins or across repeat views by the same one.
  describe("audit trail", () => {
    it("writes an AuditLog row matching the rest of this codebase's admin-action shape", async () => {
      const { tx, prisma } = buildDeps(sampleMerchantRow());
      const service = buildService(prisma);

      await service.adminGetDetail("admin1", "m1");

      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorType: "ADMIN",
          actorId: "admin1",
          action: "merchant.kyc.viewed",
          entity: "Merchant",
          entityId: "m1",
          diffJson: { verificationStatus: "SUBMITTED" },
        },
      });
    });

    it("a SECOND admin's read of the SAME merchant is audited independently, under their own actorId", async () => {
      const { tx, prisma } = buildDeps(sampleMerchantRow());
      const service = buildService(prisma);

      await service.adminGetDetail("admin1", "m1");
      await service.adminGetDetail("admin2", "m1");

      expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
      expect(tx.auditLog.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({ actorId: "admin1", entityId: "m1" }),
      });
      expect(tx.auditLog.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({ actorId: "admin2", entityId: "m1" }),
      });
    });

    it("the read and its audit row commit inside the SAME transaction", async () => {
      const { prisma } = buildDeps(sampleMerchantRow());
      const service = buildService(prisma);

      await service.adminGetDetail("admin1", "m1");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
