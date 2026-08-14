import { Prisma } from "@prisma/client";
import { PaymentSettleService } from "./payment-settle.service";

function buildFakeTx(overrides: Record<string, any> = {}) {
  return {
    payment: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
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
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.0",
    meta: { target: ["externalEventId"] },
  });
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
    tx.reservation.updateMany.mockResolvedValue({ count: 1 });
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
    // [I4] The WHERE derives from allowedFromStatusesFor("CONFIRMED"),
    // which is ["PENDING_PAYMENT"] — asserted as the concrete list here
    // since that's the observable contract callers depend on.
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: "resv1", status: { in: ["PENDING_PAYMENT"] } },
      data: { status: "CONFIRMED" },
    });
    expect(offerStock.release).not.toHaveBeenCalled();
  });

  it("[C2] amount mismatch is quarantined: Payment -> FAILED, Reservation -> EXPIRED, stock released", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(paidPayment({ amountCents: 5001 }));
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.reservation.updateMany.mockResolvedValue({ count: 1 });
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(baseEvent); // totalCents: 5000, expected 5001
    expect(outcome).toBe("amount_mismatch_quarantined");
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        merchantOid: "KRVabc",
        status: { in: ["INTENT", "PROCESSING"] },
      },
      data: { status: "FAILED" },
    });
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: "resv1", status: { in: ["PENDING_PAYMENT"] } },
      data: { status: "EXPIRED" },
    });
    expect(offerStock.release).toHaveBeenCalledWith(tx, "offer1", 2);
  });

  it("[C2] a benign already-PAID payment reports 'already_terminal' (duplicate delivery, different event id)", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(paidPayment());
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    tx.payment.findUniqueOrThrow.mockResolvedValue(
      paidPayment({ status: "PAID" }),
    );
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(baseEvent);
    expect(outcome).toBe("already_terminal");
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
  });

  it("[C2] a success event arriving after Payment was already FAILED is elevated to 'charged_after_failed', not the benign no-op", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(paidPayment());
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    tx.payment.findUniqueOrThrow.mockResolvedValue(
      paidPayment({ status: "FAILED" }),
    );
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(baseEvent);
    expect(outcome).toBe("charged_after_failed");
  });

  it("[C2] Payment settles PAID but the reservation is no longer confirmable -> rolls back (returns 'orphaned_success')", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(paidPayment());
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.reservation.updateMany.mockResolvedValue({ count: 0 }); // reservation no longer PENDING_PAYMENT
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(baseEvent);
    expect(outcome).toBe("orphaned_success");
    expect(tx.reservation.updateMany).toHaveBeenCalledTimes(1);
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
    tx.reservation.updateMany.mockResolvedValue({ count: 1 });
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
      where: { id: "resv1", status: { in: ["PENDING_PAYMENT"] } },
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
    tx.reservation.updateMany.mockResolvedValue({ count: 1 });
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(failedEvent);
    expect(outcome).toBe("expired");
  });

  it("no-ops when the Payment already left INTENT/PROCESSING (e.g. already settled elsewhere)", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(pendingPayment({ status: "PAID" }));
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(failedEvent);
    expect(outcome).toBe("already_terminal");
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
    expect(offerStock.release).not.toHaveBeenCalled();
  });

  it("[C1] does NOT double-release stock when the Reservation already left PENDING_PAYMENT (e.g. a prior cancel() already released it)", async () => {
    const { prisma, tx, offerStock, facade } = buildDeps();
    tx.payment.findUnique.mockResolvedValue(pendingPayment());
    tx.payment.updateMany.mockResolvedValue({ count: 1 }); // Payment WAS still INTENT
    tx.reservation.updateMany.mockResolvedValue({ count: 0 }); // but Reservation already left PENDING_PAYMENT
    const service = new PaymentSettleService(
      prisma as any,
      offerStock as any,
      facade as any,
    );

    const outcome = await service.settle(failedEvent);
    expect(outcome).toBe("expired");
    expect(offerStock.release).not.toHaveBeenCalled();
  });
});
