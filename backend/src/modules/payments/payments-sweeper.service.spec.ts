import { PaymentsSweeperService } from "./payments-sweeper.service";

function buildDeps() {
  const prisma = { payment: { findMany: jest.fn() } };
  const facade = { queryStatus: jest.fn() };
  const settle = { settle: jest.fn().mockResolvedValue("confirmed") };
  return { prisma, facade, settle };
}

describe("PaymentsSweeperService.sweepOne", () => {
  it("provider reports paid -> settles a 'success' event using the provider's paidAmountCents", async () => {
    const { prisma, facade, settle } = buildDeps();
    facade.queryStatus.mockResolvedValue({
      status: "paid",
      paidAmountCents: 4200,
    });
    const service = new PaymentsSweeperService(
      prisma as any,
      facade as any,
      settle as any,
    );

    await service.sweepOne("KRVabc", 5000);

    expect(settle.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantOid: "KRVabc",
        status: "success",
        totalCents: 4200,
      }),
    );
  });

  it("provider reports paid without paidAmountCents -> falls back to the Payment's own amountCents", async () => {
    const { prisma, facade, settle } = buildDeps();
    facade.queryStatus.mockResolvedValue({ status: "paid" });
    const service = new PaymentsSweeperService(
      prisma as any,
      facade as any,
      settle as any,
    );

    await service.sweepOne("KRVabc", 5000);

    expect(settle.settle).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 5000 }),
    );
  });

  it.each(["pending", "failed"] as const)(
    "provider reports %s -> settles a 'failed' event (reclaim stock, TTL already past)",
    async (status) => {
      const { prisma, facade, settle } = buildDeps();
      facade.queryStatus.mockResolvedValue({ status });
      const service = new PaymentsSweeperService(
        prisma as any,
        facade as any,
        settle as any,
      );

      await service.sweepOne("KRVabc", 5000);

      expect(settle.settle).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantOid: "KRVabc",
          status: "failed",
          totalCents: 5000,
        }),
      );
    },
  );

  it("each sweep uses a fresh, distinct externalEventId (idempotency comes from settle()'s status guard, not event-id matching)", async () => {
    const { prisma, facade, settle } = buildDeps();
    facade.queryStatus.mockResolvedValue({ status: "pending" });
    const service = new PaymentsSweeperService(
      prisma as any,
      facade as any,
      settle as any,
    );

    await service.sweepOne("KRVabc", 5000);
    await service.sweepOne("KRVabc", 5000);

    const [firstCall, secondCall] = settle.settle.mock.calls;
    expect(firstCall[0].externalEventId).not.toBe(
      secondCall[0].externalEventId,
    );
  });

  it("swallows a queryStatus error and leaves the payment for the next tick (does not call settle)", async () => {
    const { prisma, facade, settle } = buildDeps();
    facade.queryStatus.mockRejectedValue(new Error("provider unreachable"));
    const service = new PaymentsSweeperService(
      prisma as any,
      facade as any,
      settle as any,
    );

    await expect(service.sweepOne("KRVabc", 5000)).resolves.toBeUndefined();
    expect(settle.settle).not.toHaveBeenCalled();
  });
});

describe("PaymentsSweeperService.sweepStaleIntents", () => {
  it("queries only stale INTENT/PROCESSING payments and sweeps each one", async () => {
    const { prisma, facade, settle } = buildDeps();
    prisma.payment.findMany.mockResolvedValue([
      { merchantOid: "a", amountCents: 100 },
      { merchantOid: "b", amountCents: 200 },
    ]);
    facade.queryStatus.mockResolvedValue({ status: "pending" });
    const service = new PaymentsSweeperService(
      prisma as any,
      facade as any,
      settle as any,
    );

    await service.sweepStaleIntents();

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ["INTENT", "PROCESSING"] },
          createdAt: { lt: expect.any(Date) },
        },
      }),
    );
    expect(settle.settle).toHaveBeenCalledTimes(2);
  });

  it("does nothing when there are no stale payments", async () => {
    const { prisma, facade, settle } = buildDeps();
    prisma.payment.findMany.mockResolvedValue([]);
    const service = new PaymentsSweeperService(
      prisma as any,
      facade as any,
      settle as any,
    );

    await service.sweepStaleIntents();
    expect(facade.queryStatus).not.toHaveBeenCalled();
  });
});
