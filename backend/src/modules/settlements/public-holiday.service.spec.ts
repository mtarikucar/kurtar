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
});
