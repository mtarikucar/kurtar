import { Prisma } from "@prisma/client";
import { PaymentSettleService } from "./payment-settle.service";

function buildFakeTx(overrides: Record<string, any> = {}) {
  return {
    payment: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      ...overrides.payment,
    },
    reservation: {
      updateMany: jest.fn(),
      ...overrides.reservation,
    },
  };
}

function buildDeps() {
  const tx = buildFakeTx();
  const prisma = {
    webhookEventLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn((cb: any) => cb(tx)),
  };
  const offerStock = { release: jest.fn().mockResolvedValue(true) };
  const facade = { activeProviderId: jest.fn().mockReturnValue("mock") };
  return { tx, prisma, offerStock, facade };
}

function uniqueViolation() {
  const err = new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed",
    {
      code: "P2002",
      clientVersion: "6.19.0",
      meta: { target: ["externalEventId"] },
    },
  );
  return err;
}

const baseEvent = {
  merchantOid: "KRVabc",
  status: "success" as const,
  totalCents: 5000,
  externalEventId: "evt-1",
};

describe("PaymentSettleService.settle — idempotency gate", () => {
  it("returns 'duplicate' without touching Payment/Reservation when WebhookEventLog insert unique-violates", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    prisma.webhookEventLog.create.mockRejectedValue(uniqueViolation());
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(baseEvent);
    expect(outcome).toBe("duplicate");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.payment.findUnique).not.toHaveBeenCalled();
  });

  it("rethrows a non-unique-violation error from the WebhookEventLog insert", async () => {
    const { prisma, offerStock, facade } = buildDeps();
    prisma.webhookEventLog.create.mockRejectedValue(new Error("db is down"));
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );
    await expect(service.settle(baseEvent)).rejects.toThrow("db is down");
  });
});

describe("PaymentSettleService.settle — unknown merchantOid", () => {
  it("returns 'unknown_merchant_oid' and does not throw", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(null);
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );
    await expect(service.settle(baseEvent)).resolves.toBe(
      "unknown_merchant_oid",
    );
  });
});

describe("PaymentSettleService.settle — success path", () => {
  function paidPayment(overrides: Record<string, any> = {}) {
    return {
      id: "pay1",
      merchantOid: "KRVabc",
      amountCents: 5000,
      status: "INTENT",
      reservationId: "resv1",
      reservation: { offerId: "offer1", qty: 2 },
      ...overrides,
    };
  }

  it("confirms: Payment -> PAID, Reservation -> CONFIRMED", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(paidPayment());
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(baseEvent);
    expect(outcome).toBe("confirmed");
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        merchantOid: "KRVabc",
        status: { in: ["INTENT", "PROCESSING"] },
      },
      data: { status: "PAID", paidAt: expect.any(Date) },
    });
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: "resv1", status: "PENDING_PAYMENT" },
      data: { status: "CONFIRMED" },
    });
    expect(offerStock.release).not.toHaveBeenCalled();
  });

  it("amount mismatch: does NOT settle, Payment untouched", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(paidPayment({ amountCents: 5001 }));
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(baseEvent); // totalCents: 5000, expected 5001
    expect(outcome).toBe("amount_mismatch");
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
  });

  it("no-ops when the Payment already left INTENT/PROCESSING (e.g. sweeper-expired first)", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(paidPayment({ status: "FAILED" }));
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(baseEvent);
    expect(outcome).toBe("already_terminal");
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
  });
});

describe("PaymentSettleService.settle — failure path", () => {
  function pendingPayment(overrides: Record<string, any> = {}) {
    return {
      id: "pay1",
      merchantOid: "KRVabc",
      amountCents: 5000,
      status: "INTENT",
      reservationId: "resv1",
      reservation: { offerId: "offer1", qty: 2 },
      ...overrides,
    };
  }
  const failedEvent = { ...baseEvent, status: "failed" as const };

  it("expires: Payment -> FAILED, Reservation -> EXPIRED, stock released", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(pendingPayment());
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(failedEvent);
    expect(outcome).toBe("expired");
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        merchantOid: "KRVabc",
        status: { in: ["INTENT", "PROCESSING"] },
      },
      data: { status: "FAILED" },
    });
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: "resv1", status: "PENDING_PAYMENT" },
      data: { status: "EXPIRED" },
    });
    expect(offerStock.release).toHaveBeenCalledWith(tx, "offer1", 2);
  });

  it("no amount check on the failure branch (totalCents is irrelevant)", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(
      pendingPayment({ amountCents: 999999 }),
    );
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(failedEvent);
    expect(outcome).toBe("expired");
  });
});
