import { Injectable } from "@nestjs/common";
import { Response } from "express";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { streamCsv } from "../../common/utils/csv.util";

export interface ExportRange {
  from?: string;
  to?: string;
}

function createdAtWhere(range: ExportRange): Prisma.DateTimeFilter | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from && { gte: new Date(range.from) }),
    ...(range.to && { lte: new Date(range.to) }),
  };
}

/**
 * Streaming CSV exports (brief §6) — the ETAHS/Ticaret Bakanlığı evidence
 * trail. All three reuse ONE streaming helper (common/utils/csv.util.ts's
 * streamCsv) and page through the DB in bounded chunks rather than
 * materializing the whole result set — a year of complaints/settlements
 * across every merchant could otherwise be tens of thousands of rows held
 * in memory at once. `res` is the raw Express response
 * (`@Res({passthrough:false})` at the controller) — streamCsv owns
 * writing/ending it.
 *
 * [Fix round, Minor] Every `orderBy` carries `id: "asc"` as a secondary
 * sort key — `createdAt` alone is not a stable sort when two rows share
 * the exact same millisecond (plausible for complaints/merchants created
 * in the same request burst), and an unstable sort under OFFSET/LIMIT
 * pagination can skip or duplicate a row across a page boundary. Still
 * plain offset pagination, not keyset — acceptable here (bounded by
 * `pageSize`, not the total row count, so the O(n) OFFSET cost only
 * matters for a genuinely huge export) but flagged as the natural next
 * step if these exports ever need to scale past what an admin actually
 * pages through by hand.
 */
@Injectable()
export class AdminExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async streamComplaintsCsv(res: Response, range: ExportRange): Promise<void> {
    const createdAt = createdAtWhere(range);
    await streamCsv(
      res,
      "complaints.csv",
      [
        "id",
        "category",
        "status",
        "userId",
        "merchantId",
        "reservationId",
        "slaDeadlineAt",
        "resolvedAt",
        "createdAt",
      ],
      (skip, take) =>
        this.prisma.complaintTicket.findMany({
          where: { ...(createdAt && { createdAt }) },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip,
          take,
        }),
      (row) => [
        row.id,
        row.category,
        row.status,
        row.userId,
        row.merchantId,
        row.reservationId,
        row.slaDeadlineAt.toISOString(),
        row.resolvedAt?.toISOString() ?? "",
        row.createdAt.toISOString(),
      ],
    );
  }

  async streamSettlementsCsv(res: Response, range: ExportRange): Promise<void> {
    const createdAt = createdAtWhere(range);
    await streamCsv(
      res,
      "settlements.csv",
      [
        "id",
        "merchantId",
        "periodStart",
        "periodEnd",
        "status",
        "grossCents",
        "bagFeeCents",
        "bagFeeVatCents",
        "withholdingCents",
        "membershipOffsetCents",
        "refundClawbackCents",
        "netPayoutCents",
        "dueAt",
        "sentAt",
        "createdAt",
      ],
      (skip, take) =>
        this.prisma.settlementBatch.findMany({
          where: { ...(createdAt && { createdAt }) },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip,
          take,
        }),
      (row) => [
        row.id,
        row.merchantId,
        row.periodStart.toISOString(),
        row.periodEnd.toISOString(),
        row.status,
        row.grossCents,
        row.bagFeeCents,
        row.bagFeeVatCents,
        row.withholdingCents,
        row.membershipOffsetCents,
        row.refundClawbackCents,
        row.netPayoutCents,
        row.dueAt?.toISOString() ?? "",
        row.sentAt?.toISOString() ?? "",
        row.createdAt.toISOString(),
      ],
    );
  }

  /**
   * [Cross-lane fix, I14] The bulk read of the same bank/tax identity
   * MerchantsService.adminGetDetail audits one merchant at a time — every
   * merchant's `taxId` and full `iban` in one file. It wrote no audit row
   * at all, which made it the widest PII/bank-detail path in the product
   * and the only one with no forensic trace; under KVKK that is the gap,
   * not the export itself.
   *
   * Two changes:
   *
   *  1. The audit row is written FIRST and `await`ed, so a failure to
   *     record the export means no bytes are streamed. It is deliberately
   *     NOT inside a transaction with the read: an HTTP response stream
   *     is not a transaction, and holding one open across a paged stream
   *     to an admin's browser would pin a connection for the whole
   *     download. Committing the record before the first row leaves the
   *     honest failure mode (a recorded export that then failed midway),
   *     never the dishonest one (an export with no record).
   *  2. An explicit `select` of exactly the eight emitted columns. The
   *     query used to fetch every Merchant column — mersisNo, kepAddress,
   *     ownerName, contact email/phone, the attestation timestamps — and
   *     throw all of it away after the row mapper read eight fields.
   */
  async streamMerchantsCsv(
    res: Response,
    range: ExportRange,
    adminId: string,
  ): Promise<void> {
    const createdAt = createdAtWhere(range);
    await this.prisma.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: adminId,
        action: "merchant.kyc.exported",
        entity: "Merchant",
        // Platform-wide, not one merchant — the requested range IS the
        // identity of what was taken.
        entityId: "*",
        diffJson: { from: range.from ?? null, to: range.to ?? null },
      },
    });
    await streamCsv(
      res,
      "merchants.csv",
      [
        "id",
        "legalName",
        "tradeName",
        "taxId",
        "iban",
        "verificationStatus",
        "verifiedAt",
        "createdAt",
      ],
      (skip, take) =>
        this.prisma.merchant.findMany({
          where: { ...(createdAt && { createdAt }) },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip,
          take,
          select: {
            id: true,
            legalName: true,
            tradeName: true,
            taxId: true,
            iban: true,
            verificationStatus: true,
            verifiedAt: true,
            createdAt: true,
          },
        }),
      (row) => [
        row.id,
        row.legalName,
        row.tradeName,
        row.taxId,
        row.iban,
        row.verificationStatus,
        row.verifiedAt?.toISOString() ?? "",
        row.createdAt.toISOString(),
      ],
    );
  }
}
