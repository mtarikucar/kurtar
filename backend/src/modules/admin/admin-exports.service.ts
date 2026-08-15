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
          orderBy: { createdAt: "asc" },
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
          orderBy: { createdAt: "asc" },
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

  async streamMerchantsCsv(res: Response, range: ExportRange): Promise<void> {
    const createdAt = createdAtWhere(range);
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
          orderBy: { createdAt: "asc" },
          skip,
          take,
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
