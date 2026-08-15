import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ReservationsService } from "./reservations.service";
import { OutboxService } from "../outbox/outbox.service";

function buildFakeTx(overrides: Record<string, any> = {}) {
  return {
    dailyOffer: {
      findUnique: jest.fn(),
      update: jest.fn(),
      ...overrides.dailyOffer,
    },
    reservation: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      ...overrides.reservation,
    },
    payment: {
      create: jest.fn(),
      updateMany: jest.fn(),
      ...overrides.payment,
    },
    refund: {
      create: jest.fn(),
      ...overrides.refund,
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({}),
      ...overrides.outboxEvent,
    },
    $executeRaw: jest.fn(),
  };
}

function buildDeps() {
  const tx = buildFakeTx();
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    payment: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    reservation: {
      findUnique: jest.fn(),
      count: jest.fn(),
      $queryRaw: jest.fn(),
    },
    refund: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const offerStock = { claim: jest.fn(), release: jest.fn() };
  const facade = {
    activeProviderId: jest.fn().mockReturnValue("mock"),
    createIntent: jest.fn(),
    refund: jest.fn(),
  };
  // Real OutboxService (no constructor deps) — its own dedicated spec
  // covers its behavior; here it just needs tx.outboxEvent.create to
  // exist on the fake tx (above), which every redeem()-exercising test
  // gets via buildFakeTx().
  const outbox = new OutboxService();
  return { tx, prisma, offerStock, facade, outbox };
}

/**
 * cancel()'s reservation.updateMany is called once per candidate starting
 * status (PENDING_PAYMENT, then CONFIRMED) until one matches — see
 * reservations.service.ts's CANCELLABLE_FROM loop. This makes the mock
 * behave like the real compound-WHERE update: only the call whose
 * `where.status` equals the reservation's TRUE current status "matches".
 */
function mockCancelReservationUpdate(tx: any, trueStatus: string) {
  tx.reservation.updateMany.mockImplementation((args: any) =>
    Promise.resolve({ count: args.where.status === trueStatus ? 1 : 0 }),
  );
}

function uniqueCodeViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.0",
    meta: { target: ["code"] },
  });
}

describe("ReservationsService.create", () => {
  it("throws OFFER_NOT_FOUND when the offer does not exist", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    tx.dailyOffer.findUnique.mockResolvedValue(null);
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );

    await expect(service.create("user1", "offer1", 1)).rejects.toMatchObject({
      response: { errorCode: "OFFER_NOT_FOUND" },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("throws the uniform OFFER_UNAVAILABLE error when the atomic claim fails", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    tx.dailyOffer.findUnique.mockResolvedValue({
      id: "offer1",
      storeId: "store1",
      pickupStartAt: new Date("2026-08-13T18:00:00Z"),
      bagTemplate: { priceCents: 5000 },
    });
    offerStock.claim.mockResolvedValue(false);
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );

    const err = await service.create("user1", "offer1", 2).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response.errorCode).toBe("OFFER_UNAVAILABLE");
  });

  it("computes price/total/cancelDeadline server-side and never from client input", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    tx.dailyOffer.findUnique.mockResolvedValue({
      id: "offer1",
      storeId: "store1",
      pickupStartAt: new Date("2026-08-13T18:00:00.000Z"),
      bagTemplate: { priceCents: 5000 },
    });
    offerStock.claim.mockResolvedValue(true);
    tx.reservation.create.mockResolvedValue({ id: "resv1", code: "K-ABCD" });
    facade.createIntent.mockResolvedValue({
      providerRef: "ref1",
      redirectUrl: "https://pay",
    });

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    const result = await service.create("user1", "offer1", 3);

    expect(tx.reservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        unitPriceCents: 5000,
        totalCents: 15000, // 5000 * 3, never taken from the caller
        cancelDeadlineAt: new Date("2026-08-13T16:00:00.000Z"), // pickupStartAt - 2h
      }),
    });
    expect(result.totalCents).toBe(15000);
    expect(result.payment.redirectUrl).toBe("https://pay");
  });

  it("[I3] retries the WHOLE transaction (fresh stock claim included) on a reservation-code collision, not just the failed INSERT", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    tx.dailyOffer.findUnique.mockResolvedValue({
      id: "offer1",
      storeId: "store1",
      pickupStartAt: new Date("2026-08-13T18:00:00.000Z"),
      bagTemplate: { priceCents: 5000 },
    });
    offerStock.claim.mockResolvedValue(true);
    tx.reservation.create
      .mockRejectedValueOnce(uniqueCodeViolation())
      .mockResolvedValueOnce({ id: "resv1", code: "K-EFGH" });
    facade.createIntent.mockResolvedValue({ providerRef: "ref1" });

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    const result = await service.create("user1", "offer1", 1);

    expect(result.reservationId).toBe("resv1");
    // The retry re-ran the WHOLE transaction, including re-claiming
    // stock — not just a second INSERT attempt inside an already-aborted
    // transaction (which is what the pre-fix code did, and which would
    // have failed with Postgres error 25P02 on the retry, not another
    // P2002).
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(offerStock.claim).toHaveBeenCalledTimes(2);
    expect(tx.reservation.create).toHaveBeenCalledTimes(2);
  });

  it("[I3] gives up after MAX_CODE_ATTEMPTS consecutive collisions and propagates the error", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    tx.dailyOffer.findUnique.mockResolvedValue({
      id: "offer1",
      storeId: "store1",
      pickupStartAt: new Date("2026-08-13T18:00:00.000Z"),
      bagTemplate: { priceCents: 5000 },
    });
    offerStock.claim.mockResolvedValue(true);
    tx.reservation.create.mockRejectedValue(uniqueCodeViolation());

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    await expect(service.create("user1", "offer1", 1)).rejects.toThrow();
    expect(prisma.$transaction).toHaveBeenCalledTimes(5); // MAX_CODE_ATTEMPTS
  });

  it("compensates (Payment FAILED, Reservation EXPIRED, stock released) when createIntent fails, and returns 503", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    tx.dailyOffer.findUnique.mockResolvedValue({
      id: "offer1",
      storeId: "store1",
      pickupStartAt: new Date("2026-08-13T18:00:00.000Z"),
      bagTemplate: { priceCents: 5000 },
    });
    offerStock.claim.mockResolvedValue(true);
    tx.reservation.create.mockResolvedValue({ id: "resv1", code: "K-ABCD" });
    facade.createIntent.mockRejectedValue(new Error("provider down"));
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.reservation.updateMany.mockResolvedValue({ count: 1 });
    offerStock.release.mockResolvedValue(true);

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    await expect(service.create("user1", "offer1", 1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    // Second $transaction call is the compensation.
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { merchantOid: expect.any(String), status: "INTENT" },
      data: { status: "FAILED" },
    });
    // [I4] Derived from allowedFromStatusesFor("EXPIRED") = ["PENDING_PAYMENT"].
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: "resv1", status: { in: ["PENDING_PAYMENT"] } },
      data: { status: "EXPIRED" },
    });
    expect(offerStock.release).toHaveBeenCalledWith(tx, "offer1", 1);
  });

  it("skips compensation writes when a concurrent path already moved the Payment out of INTENT", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    tx.dailyOffer.findUnique.mockResolvedValue({
      id: "offer1",
      storeId: "store1",
      pickupStartAt: new Date("2026-08-13T18:00:00.000Z"),
      bagTemplate: { priceCents: 5000 },
    });
    offerStock.claim.mockResolvedValue(true);
    tx.reservation.create.mockResolvedValue({ id: "resv1", code: "K-ABCD" });
    facade.createIntent.mockRejectedValue(new Error("provider down"));
    tx.payment.updateMany.mockResolvedValue({ count: 0 });

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    await expect(service.create("user1", "offer1", 1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
    expect(offerStock.release).not.toHaveBeenCalled();
  });

  it("[C1] does NOT double-release stock in compensation when the Reservation already left PENDING_PAYMENT (e.g. the user cancelled it first)", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    tx.dailyOffer.findUnique.mockResolvedValue({
      id: "offer1",
      storeId: "store1",
      pickupStartAt: new Date("2026-08-13T18:00:00.000Z"),
      bagTemplate: { priceCents: 5000 },
    });
    offerStock.claim.mockResolvedValue(true);
    tx.reservation.create.mockResolvedValue({ id: "resv1", code: "K-ABCD" });
    facade.createIntent.mockRejectedValue(new Error("provider down"));
    tx.payment.updateMany.mockResolvedValue({ count: 1 }); // Payment WAS still INTENT
    tx.reservation.updateMany.mockResolvedValue({ count: 0 }); // but Reservation already left PENDING_PAYMENT

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    await expect(service.create("user1", "offer1", 1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(offerStock.release).not.toHaveBeenCalled();
  });
});

describe("ReservationsService.cancel", () => {
  function baseReservation(overrides: Record<string, any> = {}) {
    return {
      id: "resv1",
      userId: "user1",
      offerId: "offer1",
      qty: 2,
      status: "PENDING_PAYMENT",
      cancelDeadlineAt: new Date(Date.now() + 60_000),
      payment: { id: "pay1", merchantOid: "KRVxxx", amountCents: 5000 },
      ...overrides,
    };
  }

  it("throws RESERVATION_NOT_FOUND for a nonexistent reservation", async () => {
    const { prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    await expect(service.cancel("user1", "nope")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("throws FORBIDDEN when the reservation belongs to a different user", async () => {
    const { prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation({ userId: "someone-else" }),
    );
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    await expect(service.cancel("user1", "resv1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("throws the uniform RESERVATION_NOT_CANCELLABLE error past the deadline (neither candidate status matches)", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation({ cancelDeadlineAt: new Date(Date.now() - 1000) }),
    );
    tx.reservation.updateMany.mockResolvedValue({ count: 0 });
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );

    const err = await service.cancel("user1", "resv1").catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response.errorCode).toBe("RESERVATION_NOT_CANCELLABLE");
    expect(offerStock.release).not.toHaveBeenCalled();
  });

  it("[C1] terminates a still-live Payment intent in the SAME transaction as the cancel", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation(),
    );
    mockCancelReservationUpdate(tx, "PENDING_PAYMENT");
    offerStock.release.mockResolvedValue(true);

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    await service.cancel("user1", "resv1");

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "pay1", status: { in: ["INTENT", "PROCESSING"] } },
      data: { status: "FAILED" },
    });
  });

  it("PENDING_PAYMENT cancel releases stock and does NOT call refund", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation(),
    );
    mockCancelReservationUpdate(tx, "PENDING_PAYMENT");
    offerStock.release.mockResolvedValue(true);
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );

    const result = await service.cancel("user1", "resv1");
    expect(result.status).toBe("CANCELLED_BY_USER");
    expect(offerStock.release).toHaveBeenCalledWith(tx, "offer1", 2);
    expect(facade.refund).not.toHaveBeenCalled();
  });

  it("CONFIRMED cancel calls facade.refund with the full amount and records a Refund row", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation({ status: "CONFIRMED" }),
    );
    mockCancelReservationUpdate(tx, "CONFIRMED");
    offerStock.release.mockResolvedValue(true);
    facade.refund.mockResolvedValue({ refundRef: "mock-refund-1" });

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    await service.cancel("user1", "resv1");

    expect(facade.refund).toHaveBeenCalledWith("KRVxxx", 5000);
    expect(tx.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: "pay1",
        amountCents: 5000,
        reason: "USER_CANCEL",
        pspRefundId: "mock-refund-1",
        status: "DONE",
      }),
    });
  });

  it("[I2] derives the refund decision from the IN-TRANSACTION match, not the stale pre-transaction read — a webhook confirming concurrently must still trigger a refund", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    // The pre-transaction read (used only for not-found/not-owner checks)
    // is stale: it still shows PENDING_PAYMENT.
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation({ status: "PENDING_PAYMENT" }),
    );
    // But by the time the transaction actually runs, a concurrent webhook
    // has already confirmed+paid it — only the CONFIRMED-targeted
    // updateMany matches.
    mockCancelReservationUpdate(tx, "CONFIRMED");
    offerStock.release.mockResolvedValue(true);
    facade.refund.mockResolvedValue({ refundRef: "mock-refund-2" });

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    await service.cancel("user1", "resv1");

    expect(facade.refund).toHaveBeenCalledWith("KRVxxx", 5000);
  });

  it("a provider-side refund failure records a FAILED Refund row (no money moved, safe to retry)", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation({ status: "CONFIRMED" }),
    );
    mockCancelReservationUpdate(tx, "CONFIRMED");
    offerStock.release.mockResolvedValue(true);
    facade.refund.mockRejectedValue(new Error("provider down"));
    prisma.refund.create = jest.fn().mockResolvedValue({});

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    const result = await service.cancel("user1", "resv1");

    expect(result.status).toBe("CANCELLED_BY_USER");
    expect(prisma.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "FAILED" }),
    });
    // No refundRef — the provider call never returned one.
    expect(prisma.refund.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ pspRefundId: expect.anything() }),
    });
  });

  it("[I1] a bookkeeping failure AFTER a successful provider refund is recorded as SENT with the real refundRef, never FAILED (prevents a double-refund on manual retry)", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation({ status: "CONFIRMED" }),
    );
    mockCancelReservationUpdate(tx, "CONFIRMED");
    offerStock.release.mockResolvedValue(true);
    facade.refund.mockResolvedValue({ refundRef: "mock-refund-3" });
    prisma.refund.create = jest.fn().mockResolvedValue({});
    prisma.payment.updateMany = jest.fn().mockResolvedValue({ count: 1 });

    // First $transaction call is cancel()'s own; the second is the
    // refund-bookkeeping transaction, which fails AFTER the provider
    // refund above already succeeded.
    let transactionCall = 0;
    prisma.$transaction = jest.fn((cb: any) => {
      transactionCall += 1;
      if (transactionCall === 1) return cb(tx);
      throw new Error("db blip recording the refund");
    });

    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    const result = await service.cancel("user1", "resv1");

    expect(result.status).toBe("CANCELLED_BY_USER");
    expect(prisma.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SENT",
        pspRefundId: "mock-refund-3",
      }),
    });
    expect(prisma.refund.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "FAILED" }),
    });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "pay1", status: "PAID" },
      data: { status: "REFUNDED" },
    });
  });
});

describe("ReservationsService.redeem", () => {
  function baseReservation(overrides: Record<string, any> = {}) {
    return {
      id: "resv1",
      offerId: "offer1",
      userId: "u1",
      storeId: "store1",
      qty: 1,
      totalCents: 5000,
      status: "CONFIRMED",
      redeemedAt: null,
      store: { merchantId: "merchant1" },
      offer: {
        pickupStartAt: new Date(Date.now() - 60_000),
        pickupEndAt: new Date(Date.now() + 60_000),
        bagTemplate: {
          originalValueCentsMin: 10000,
          originalValueCentsMax: 20000,
        },
      },
      ...overrides,
    };
  }

  it("throws FORBIDDEN when the reservation's store belongs to a different merchant", async () => {
    const { prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation(),
    );
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    await expect(
      service.redeem("mu1", "other-merchant", "resv1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws RESERVATION_NOT_REDEEMABLE outside the pickup window", async () => {
    const { prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation({
        offer: {
          pickupStartAt: new Date(Date.now() + 60_000),
          pickupEndAt: new Date(Date.now() + 120_000),
        },
      }),
    );
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );
    const err = await service
      .redeem("mu1", "merchant1", "resv1")
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response.errorCode).toBe("RESERVATION_NOT_REDEEMABLE");
  });

  it("first redeem transitions to REDEEMED and increments qtyRedeemed", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation(),
    );
    tx.reservation.updateMany.mockResolvedValue({ count: 1 });
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );

    const result = await service.redeem("mu1", "merchant1", "resv1");
    expect(result.status).toBe("REDEEMED");
    // [I4] Derived from allowedFromStatusesFor("REDEEMED") = ["CONFIRMED"].
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: "resv1", status: { in: ["CONFIRMED"] } },
      data: expect.objectContaining({ status: "REDEEMED" }),
    });
    expect(tx.dailyOffer.update).toHaveBeenCalledWith({
      where: { id: "offer1" },
      data: { qtyRedeemed: { increment: 1 } },
    });
    // [Task 9] Both the rating-invite AND the impact-ledger outbox rows
    // are written on the winning branch — two independent events, per
    // event-types.ts's doc comment.
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(2);
    const impactCall = (tx.outboxEvent.create as jest.Mock).mock.calls.find(
      ([args]: any[]) => args.data.type === "reservation.redeemed.impact.v1",
    );
    expect(impactCall[0].data).toMatchObject({
      idempotencyKey: "reservation-redeemed-impact:resv1",
      payload: {
        reservationId: "resv1",
        userId: "u1",
        storeId: "store1",
        qty: 1,
        totalCents: 5000,
        originalValueCentsMin: 10000,
        originalValueCentsMax: 20000,
      },
    });
  });

  it("a second call after already REDEEMED short-circuits — same success, no DB writes", async () => {
    const redeemedAt = new Date();
    const { prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation({ status: "REDEEMED", redeemedAt }),
    );
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );

    const result = await service.redeem("mu1", "merchant1", "resv1");
    expect(result).toEqual({
      reservationId: "resv1",
      status: "REDEEMED",
      redeemedAt,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("losing the in-transaction race to a concurrent redeem is treated as idempotent success, not an error", async () => {
    const winnerRedeemedAt = new Date();
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation(),
    );
    tx.reservation.updateMany.mockResolvedValue({ count: 0 });
    tx.reservation.findUniqueOrThrow.mockResolvedValue({
      status: "REDEEMED",
      redeemedAt: winnerRedeemedAt,
    });
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );

    const result = await service.redeem("mu1", "merchant1", "resv1");
    expect(result).toEqual({
      reservationId: "resv1",
      status: "REDEEMED",
      redeemedAt: winnerRedeemedAt,
    });
    expect(tx.dailyOffer.update).not.toHaveBeenCalled();
  });

  it("losing the race to a genuine conflict (e.g. cancelled concurrently) throws the uniform 409", async () => {
    const { tx, prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.reservation.findUnique as jest.Mock).mockResolvedValue(
      baseReservation(),
    );
    tx.reservation.updateMany.mockResolvedValue({ count: 0 });
    tx.reservation.findUniqueOrThrow.mockResolvedValue({
      status: "CANCELLED_BY_USER",
      redeemedAt: null,
    });
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );

    const err = await service
      .redeem("mu1", "merchant1", "resv1")
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.response.errorCode).toBe("RESERVATION_NOT_REDEEMABLE");
  });
});

describe("ReservationsService.listMine", () => {
  it("passes page/pageSize through to the LIMIT/OFFSET raw query and returns total from count()", async () => {
    const { prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: "r1" }]);
    (prisma.reservation.count as jest.Mock).mockResolvedValue(1);
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );

    const result = await service.listMine("user1", 2, 10);
    expect(result).toEqual({
      items: [{ id: "r1" }],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  // [Consistency fix] Regression coverage for the field-name rename
  // itself — `listMine` used to return `limit`, the one paginated list in
  // this API that didn't match every other list's `{items,total,page,
  // pageSize}` envelope.
  it("names its 4th field pageSize, not limit — matches every other paginated list in this API", async () => {
    const { prisma, offerStock, facade, outbox } = buildDeps();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    (prisma.reservation.count as jest.Mock).mockResolvedValue(0);
    const service = new ReservationsService(
      prisma as any,
      offerStock as any,
      facade as any,
      outbox as any,
    );

    const result = await service.listMine("user1", 1, 20);
    expect(result).toHaveProperty("pageSize", 20);
    expect(result).not.toHaveProperty("limit");
  });
});
