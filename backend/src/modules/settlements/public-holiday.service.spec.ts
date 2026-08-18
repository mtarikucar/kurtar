import { Logger } from "@nestjs/common";
import { PublicHolidayService } from "./public-holiday.service";

function fakePrisma(rows: { date: Date }[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  return { prisma: { publicHoliday: { findMany } } as never, findMany };
}

describe("PublicHolidayService", () => {
  it("returns every seeded holiday as an Istanbul calendar-day key", async () => {
    const { prisma } = fakePrisma([
      { date: new Date("2026-01-01T00:00:00.000Z") },
      { date: new Date("2026-10-29T00:00:00.000Z") },
    ]);
    const service = new PublicHolidayService(prisma);

    const keys = await service.getHolidayDateKeys();
    expect([...keys].sort()).toEqual(["2026-01-01", "2026-10-29"]);
  });

  it("caches after the first call — a second call does not re-query", async () => {
    const { prisma, findMany } = fakePrisma([
      { date: new Date("2026-01-01T00:00:00.000Z") },
    ]);
    const service = new PublicHolidayService(prisma);

    await service.getHolidayDateKeys();
    await service.getHolidayDateKeys();
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("invalidate() forces the next call to re-query", async () => {
    const { prisma, findMany } = fakePrisma([
      { date: new Date("2026-01-01T00:00:00.000Z") },
    ]);
    const service = new PublicHolidayService(prisma);

    await service.getHolidayDateKeys();
    service.invalidate();
    await service.getHolidayDateKeys();
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("returns an empty set when the table has no rows", async () => {
    const { prisma } = fakePrisma([]);
    const service = new PublicHolidayService(prisma);

    const keys = await service.getHolidayDateKeys();
    expect(keys.size).toBe(0);
  });

  describe("[Fix round #6, M6] calendar-exhaustion warning", () => {
    const capture = () => {
      const warn = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      const error = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);
      return { warn, error };
    };

    afterEach(() => jest.restoreAllMocks());

    it("warns when the last seeded holiday is less than ~6 months out — the table is seeded by ONE migration that stops at 2027-10-29, with no admin CRUD and no re-seed reminder anywhere", async () => {
      const { warn } = capture();
      const { prisma } = fakePrisma([
        { date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      ]);

      await new PublicHolidayService(prisma).getHolidayDateKeys();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/public holiday calendar/i);
    });

    it("says nothing while the calendar still has a long horizon", async () => {
      const { warn, error } = capture();
      const { prisma } = fakePrisma([
        { date: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000) },
      ]);

      await new PublicHolidayService(prisma).getHolidayDateKeys();

      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it("escalates to an error when the table is empty — every payout deadline is then computed as if no bayram existed", async () => {
      const { error } = capture();
      const { prisma } = fakePrisma([]);

      await new PublicHolidayService(prisma).getHolidayDateKeys();

      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0][0])).toMatch(/EMPTY/);
    });
  });
});
