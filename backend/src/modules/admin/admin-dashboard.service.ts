import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { istanbulDateKey } from "../../common/utils/istanbul-date.util";
import { COMPLAINT_SLA_WARNING_WINDOW_MS } from "../complaints/sla-date-math";

export interface AdminDashboardTotals {
  pendingMerchantApprovals: number;
  openComplaints: number;
  complaintsSlaAtRisk: number;
  openReports: number;
  settlementBatchesNeedingAttention: number;
  today: {
    gmvCents: number;
    redeemedCount: number;
  };
}

/** Turkey has observed no DST since 2016 (fixed UTC+3 year-round), so
 * "today, Istanbul calendar day, as a UTC instant range" is a direct
 * offset-literal parse — no timezone library needed. */
function istanbulDayBoundsUtc(now: Date): { start: Date; end: Date } {
  const key = istanbulDateKey(now);
  const start = new Date(`${key}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * GET /api/admin/dashboard (brief §6) — "counts that ops actually needs,
 * one endpoint, bounded queries, no N+1." Every figure below is a single
 * `count()`/`aggregate()` (indexed on the columns each WHERE filters —
 * verificationStatus, [status, slaDeadlineAt], [status, takedownDeadlineAt],
 * [merchantId, status], [status, cancelDeadlineAt]-shaped equivalents),
 * run together via Promise.all rather than sequentially.
 */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(now: Date = new Date()): Promise<AdminDashboardTotals> {
    const { start, end } = istanbulDayBoundsUtc(now);
    const slaAtRiskThreshold = new Date(
      now.getTime() + COMPLAINT_SLA_WARNING_WINDOW_MS,
    );

    const [
      pendingMerchantApprovals,
      openComplaints,
      complaintsSlaAtRisk,
      openReports,
      settlementBatchesNeedingAttention,
      todayAgg,
    ] = await Promise.all([
      this.prisma.merchant.count({
        where: { verificationStatus: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      }),
      this.prisma.complaintTicket.count({
        where: { status: { in: ["OPEN", "MERCHANT_RESPONDED"] } },
      }),
      this.prisma.complaintTicket.count({
        where: {
          status: { in: ["OPEN", "MERCHANT_RESPONDED"] },
          slaDeadlineAt: { lte: slaAtRiskThreshold },
        },
      }),
      this.prisma.contentReport.count({ where: { status: "OPEN" } }),
      this.prisma.settlementBatch.count({
        where: { status: { in: ["HELD", "FAILED"] } },
      }),
      this.prisma.reservation.aggregate({
        where: { status: "REDEEMED", redeemedAt: { gte: start, lt: end } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
    ]);

    return {
      pendingMerchantApprovals,
      openComplaints,
      complaintsSlaAtRisk,
      openReports,
      settlementBatchesNeedingAttention,
      today: {
        gmvCents: todayAgg._sum.totalCents ?? 0,
        redeemedCount: todayAgg._count._all,
      },
    };
  }
}
