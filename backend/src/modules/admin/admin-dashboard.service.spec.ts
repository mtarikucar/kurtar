import { AdminDashboardService } from "./admin-dashboard.service";
import type { PrismaService } from "../../prisma/prisma.service";

/**
 * GMV and "bags collected" are two different numbers and used to be one
 * query.
 *
 * A no-show is a completed sale — the customer is not refunded and the
 * merchant is settled for it on exactly the same terms as a collected bag
 * — so leaving it out of GMV made the dashboard under-report what the
 * platform actually pays out on. It is NOT a collected bag, so it must
 * stay out of `redeemedCount`, which is what the merchant's own counter
 * and sell-through read.
 */
function prismaCiftligi(
  redeemed: { sum: number | null; count: number },
  noShow: { sum: number | null },
) {
  const cagrilar: { where: unknown }[] = [];
  return {
    cagrilar,
    prisma: {
      merchant: { count: jest.fn().mockResolvedValue(0) },
      complaintTicket: { count: jest.fn().mockResolvedValue(0) },
      contentReport: { count: jest.fn().mockResolvedValue(0) },
      settlementBatch: { count: jest.fn().mockResolvedValue(0) },
      reservation: {
        aggregate: jest.fn().mockImplementation((args: { where: unknown }) => {
          cagrilar.push({ where: args.where });
          const where = args.where as { status?: string };
          if (where.status === "NO_SHOW") {
            return Promise.resolve({ _sum: { totalCents: noShow.sum } });
          }
          return Promise.resolve({
            _sum: { totalCents: redeemed.sum },
            _count: { _all: redeemed.count },
          });
        }),
      },
    } as unknown as PrismaService,
  };
}

describe("AdminDashboardService — GMV counts what settles, not what was collected", () => {
  const NOW = new Date("2026-08-19T12:00:00.000Z");

  it("adds no-show revenue to GMV while leaving it out of the collected count", async () => {
    const { prisma } = prismaCiftligi(
      { sum: 100_000, count: 8 },
      { sum: 14_900 },
    );
    const sonuc = await new AdminDashboardService(prisma).getDashboard(NOW);

    expect(sonuc.today.gmvCents).toBe(114_900);
    expect(sonuc.today.redeemedCount).toBe(8);
  });

  it("dates a no-show by the window it was not collected in — it has no redeemedAt to date it by", async () => {
    const { prisma, cagrilar } = prismaCiftligi(
      { sum: 0, count: 0 },
      { sum: 0 },
    );
    await new AdminDashboardService(prisma).getDashboard(NOW);

    // Two aggregates, not one OR'd query: the numbers mean different
    // things and are dated by different fields.
    expect(cagrilar).toHaveLength(2);
    const [kurtarilan, gelinmeyen] = cagrilar.map(
      (c) => c.where as Record<string, unknown>,
    );

    expect(kurtarilan.status).toBe("REDEEMED");
    expect(kurtarilan.redeemedAt).toEqual({
      gte: new Date("2026-08-18T21:00:00.000Z"),
      lt: new Date("2026-08-19T21:00:00.000Z"),
    });

    expect(gelinmeyen.status).toBe("NO_SHOW");
    expect(gelinmeyen.redeemedAt).toBeUndefined();
    expect(gelinmeyen.offer).toEqual({
      pickupEndAt: {
        gte: new Date("2026-08-18T21:00:00.000Z"),
        lt: new Date("2026-08-19T21:00:00.000Z"),
      },
    });
  });

  it("reports zero rather than NaN when a day has neither", async () => {
    const { prisma } = prismaCiftligi({ sum: null, count: 0 }, { sum: null });
    const sonuc = await new AdminDashboardService(prisma).getDashboard(NOW);
    expect(sonuc.today).toEqual({ gmvCents: 0, redeemedCount: 0 });
  });
});
