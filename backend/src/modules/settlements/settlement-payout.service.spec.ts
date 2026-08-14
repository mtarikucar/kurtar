import { SettlementPayoutService } from "./settlement-payout.service";

/**
 * [Fix round #2, C3-residual] Unit-level coverage for executeOne's
 * "capture the stamp count, bail out on 0" guard — deliberately NOT a
 * realdb test: the real race (adminHold committing in the window between
 * executeOne's findUnique read and its payoutAttemptedAt stamp) depends on
 * exact transaction interleaving that Promise.all-style concurrency can't
 * reliably reproduce on demand. A fake Prisma client whose updateMany
 * returns {count: 0} — simulating "lost the race, someone else already
 * moved this batch" — exercises the EXACT guard deterministically: the
 * provider must never be called, and the function must return the batch's
 * current (re-read) state instead of proceeding with a stale amount.
 */
describe("SettlementPayoutService.executeOne — payoutAttemptedAt stamp race", () => {
  const APPROVED_BATCH = {
    id: "batch1",
    status: "APPROVED",
    netPayoutCents: 8850,
    payoutAttemptedAt: null,
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-08-02T00:00:00.000Z"),
    merchantId: "merchant1",
    merchant: { iban: "TR000000000000000000000000", pspSubMerchantKey: null },
  };

  it("bails out without calling the provider when the payoutAttemptedAt stamp matches 0 rows (lost the race to a concurrent hold/recompute)", async () => {
    const heldAfterRace = {
      ...APPROVED_BATCH,
      status: "HELD",
      payoutAttemptedAt: null,
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const findUniqueOrThrow = jest.fn().mockResolvedValue(heldAfterRace);
    const prisma = {
      settlementBatch: {
        findUnique: jest.fn().mockResolvedValue(APPROVED_BATCH),
        updateMany,
        findUniqueOrThrow,
      },
    };
    const facade = { payout: jest.fn() };
    const outbox = { publish: jest.fn() };

    const service = new SettlementPayoutService(
      prisma as never,
      facade as never,
      outbox as never,
    );
    const result = await service.executeOne("batch1");

    // The stamp was attempted (guarded), but the provider must NEVER be
    // called once it matches 0 rows — this is the exact money-leak the
    // re-review caught (a real provider call with a possibly-stale
    // amount, on a batch that is no longer authoritatively APPROVED).
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "batch1", status: "APPROVED", payoutAttemptedAt: null },
      data: { payoutAttemptedAt: expect.any(Date) },
    });
    expect(facade.payout).not.toHaveBeenCalled();
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "batch1" },
    });
    expect(result).toBe(heldAfterRace);
  });

  it("proceeds to call the provider when the stamp succeeds (count 1, the normal first-attempt path)", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      settlementBatch: {
        findUnique: jest.fn().mockResolvedValue(APPROVED_BATCH),
        updateMany,
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          settlementBatch: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              ...APPROVED_BATCH,
              status: "SENT",
              pspTransferRef: "mock-ref",
            }),
          },
        };
        return fn(tx);
      }),
    };
    const facade = {
      payout: jest.fn().mockResolvedValue({ pspTransferRef: "mock-ref" }),
    };
    const outbox = { publish: jest.fn() };

    const service = new SettlementPayoutService(
      prisma as never,
      facade as never,
      outbox as never,
    );
    const result = await service.executeOne("batch1");

    expect(facade.payout).toHaveBeenCalledWith(
      APPROVED_BATCH.merchant.iban,
      APPROVED_BATCH.netPayoutCents,
      "batch1",
    );
    expect((result as { status: string }).status).toBe("SENT");
  });

  it("skips the stamp entirely (and proceeds straight to the provider) when payoutAttemptedAt is already set — the legitimate retry-after-failure path", async () => {
    const alreadyAttempted = {
      ...APPROVED_BATCH,
      payoutAttemptedAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    const updateMany = jest.fn();
    const prisma = {
      settlementBatch: {
        findUnique: jest.fn().mockResolvedValue(alreadyAttempted),
        updateMany,
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          settlementBatch: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              ...alreadyAttempted,
              status: "SENT",
              pspTransferRef: "mock-ref",
            }),
          },
        };
        return fn(tx);
      }),
    };
    const facade = {
      payout: jest.fn().mockResolvedValue({ pspTransferRef: "mock-ref" }),
    };
    const outbox = { publish: jest.fn() };

    const service = new SettlementPayoutService(
      prisma as never,
      facade as never,
      outbox as never,
    );
    await service.executeOne("batch1");

    expect(updateMany).not.toHaveBeenCalled(); // no re-stamp attempt
    expect(facade.payout).toHaveBeenCalled(); // still proceeds with the frozen amount
  });
});
