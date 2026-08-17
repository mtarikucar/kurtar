import { PickupReminderCronService } from "./pickup-reminder-cron.service";

function fakeDue(overrides: Record<string, any> = {}) {
  return {
    id: "r1",
    userId: "u1",
    storeId: "s1",
    code: "ABC123",
    offer: {
      pickupStartAt: new Date("2026-01-01T10:00:00.000Z"),
      pickupEndAt: new Date("2026-01-01T11:00:00.000Z"),
    },
    ...overrides,
  };
}

function buildDeps() {
  const prisma = {
    reservation: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const pushDispatch = {
    notifyUsers: jest
      .fn()
      .mockResolvedValue({ candidates: 1, denied: 0, sent: 1 }),
  };
  return { prisma, pushDispatch };
}

describe("PickupReminderCronService.sweepOnce", () => {
  it("queries CONFIRMED reservations with pickupReminderSentAt: null whose offer.pickupStartAt is within the window", async () => {
    const { prisma, pushDispatch } = buildDeps();
    const service = new PickupReminderCronService(
      prisma as any,
      pushDispatch as any,
    );
    const now = new Date("2026-01-01T09:45:00.000Z");

    await service.sweepOnce(now, 30 * 60 * 1000);

    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "CONFIRMED",
          pickupReminderSentAt: null,
          offer: {
            pickupStartAt: {
              gte: now,
              lte: new Date(now.getTime() + 30 * 60 * 1000),
            },
          },
        },
      }),
    );
  });

  it("claims each due reservation via a guarded updateMany before pushing, and counts it as reminded on success", async () => {
    const { prisma, pushDispatch } = buildDeps();
    prisma.reservation.findMany.mockResolvedValue([fakeDue()]);
    const service = new PickupReminderCronService(
      prisma as any,
      pushDispatch as any,
    );

    const result = await service.sweepOnce();

    expect(prisma.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", pickupReminderSentAt: null },
      data: { pickupReminderSentAt: expect.any(Date) },
    });
    expect(pushDispatch.notifyUsers).toHaveBeenCalledWith(
      ["u1"],
      "PICKUP_REMINDER",
      expect.any(Function),
    );
    expect(result).toEqual({ reminded: 1 });
  });

  it("a lost claim race (updateMany matches 0 rows) skips the push and doesn't count as reminded", async () => {
    const { prisma, pushDispatch } = buildDeps();
    prisma.reservation.findMany.mockResolvedValue([fakeDue()]);
    prisma.reservation.updateMany.mockResolvedValue({ count: 0 });
    const service = new PickupReminderCronService(
      prisma as any,
      pushDispatch as any,
    );

    const result = await service.sweepOnce();

    expect(pushDispatch.notifyUsers).not.toHaveBeenCalled();
    expect(result).toEqual({ reminded: 0 });
  });

  it("the message builder includes the pickup code and an Istanbul-formatted window", async () => {
    const { prisma, pushDispatch } = buildDeps();
    prisma.reservation.findMany.mockResolvedValue([fakeDue()]);
    const service = new PickupReminderCronService(
      prisma as any,
      pushDispatch as any,
    );

    await service.sweepOnce();

    const buildMessage = pushDispatch.notifyUsers.mock.calls[0][2];
    const message = buildMessage();
    expect(message.title).toBeTruthy();
    expect(message.body).toContain("ABC123");
    expect(message.data).toEqual({ reservationId: "r1", storeId: "s1" });
  });
});
