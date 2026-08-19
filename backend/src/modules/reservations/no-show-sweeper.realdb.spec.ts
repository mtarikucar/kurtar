import { ConfigService } from "@nestjs/config";
import { PrismaClient, ReservationStatus } from "@prisma/client";
import { NoShowSweeperService } from "./no-show-sweeper.service";
import { ReservationsService } from "./reservations.service";
import { OfferStockService } from "./offer-stock.service";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { OutboxService } from "../outbox/outbox.service";

/**
 * Real-DB proof of the no-show sweep — the writer that finally closes
 * `CONFIRMED -> NO_SHOW`, an edge the transitions table has declared since
 * Task 4 and nothing ever wrote. The money consequence lives in
 * settlements.realdb.spec.ts's "[i]" scenario (a NO_SHOW settles to the
 * merchant on exactly the same terms as a REDEEMED bag); this file proves
 * the state machine half: WHICH rows are taken, which are not, and that a
 * bag somebody actually collected is never taken.
 *
 * FIXTURE CLOCK. The sweep is a genuinely table-wide query (every
 * CONFIRMED reservation whose offer's pickup window closed more than the
 * grace period ago — not scoped to this suite's rows), and it MUTATES what
 * it selects. So every fixture here lives around a fixed, deliberately
 * historical `SWEEP_NOW` (January 2026) and every `sweepOnce` call is
 * given that clock explicitly: any other suite's rows sit far in the
 * future of it and are structurally out of reach, rather than merely
 * unasserted. The two tests that need `redeem()` — whose window check
 * reads the real wall clock and cannot be injected — are the exception,
 * and are called out where they occur.
 *
 * [I8] Every seeded row is scoped under this file's own tag prefixes and
 * cleaned up by store id in afterAll — never a table-wide deleteMany.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "no-show-sweep-realdb";
/** Run-scoped so a previous run's half-seeded debris (a fixture whose own
 * creation threw before the reservation existed, and which afterAll's
 * reservation-scoped cleanup therefore could not find) can never collide
 * with this run's `User.phoneE164` unique index. */
const RUN = Date.now().toString().slice(-6);
const PHONE_PREFIX = `+90555${RUN}`;
const WEBHOOK_SECRET = "no-show-sweep-realdb-webhook-secret";

/** Every fixture window below is expressed relative to this instant, and
 * every sweep is run against it — see the file doc comment. */
const SWEEP_NOW = new Date("2026-01-15T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[no-show-sweeper.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

function buildReservationsHarness(prisma: PrismaClient) {
  const registry = new PaymentProviderRegistry();
  const config = {
    get: (key: string) => ({ WEBHOOK_SECRET, PAYMENT_PROVIDER: "mock" })[key],
  } as unknown as ConfigService;
  const mockProvider = new MockPaymentProvider(config, registry);
  mockProvider.onModuleInit();
  const facade = new PaymentsFacadeService(registry, config);
  const service = new ReservationsService(
    prisma as never,
    new OfferStockService(),
    facade,
    new OutboxService(),
  );
  return { service, mockProvider };
}

let seq = 0;

d("NoShowSweeperService.sweepOnce — real DB", () => {
  let prisma: PrismaClient;
  let sweeper: NoShowSweeperService;
  let merchantId: string;
  let storeId: string;

  /** One reservation + its own offer + its own bag template (so
   * `(bagTemplateId, offerDate)` can never collide between fixtures) + its
   * own user and PAID payment. Windows are given as offsets from
   * SWEEP_NOW. */
  async function seedReservation(params: {
    status: ReservationStatus;
    pickupStartAt: Date;
    pickupEndAt: Date;
    redeemedAt?: Date;
    qty?: number;
    paymentStatus?: "PAID" | "INTENT";
  }) {
    const n = seq++;
    const qty = params.qty ?? 1;
    const bagTemplate = await prisma.bagTemplate.create({
      data: {
        storeId,
        title: `No-show sweep bag ${n}`,
        category: "BAKERY",
        allergenDisclaimer: "N/A",
        originalValueCentsMin: 10000,
        originalValueCentsMax: 20000,
        priceCents: 5000,
      },
    });
    const offer = await prisma.dailyOffer.create({
      data: {
        bagTemplateId: bagTemplate.id,
        storeId,
        offerDate: new Date(params.pickupStartAt.toISOString().slice(0, 10)),
        qtyTotal: 5,
        qtyReserved: qty,
        qtyRedeemed: params.redeemedAt ? qty : 0,
        pickupStartAt: params.pickupStartAt,
        pickupEndAt: params.pickupEndAt,
        status: "PUBLISHED",
        publishedAt: new Date(params.pickupStartAt.getTime() - 24 * HOUR),
      },
    });
    const user = await prisma.user.create({
      data: { phoneE164: `${PHONE_PREFIX}${n.toString().padStart(2, "0")}` },
    });
    const reservation = await prisma.reservation.create({
      data: {
        code: `NSSW-${RUN}-${n}`,
        userId: user.id,
        offerId: offer.id,
        storeId,
        qty,
        unitPriceCents: 5000,
        totalCents: 5000 * qty,
        status: params.status,
        cancelDeadlineAt: new Date(params.pickupStartAt.getTime() - 2 * HOUR),
        redeemedAt: params.redeemedAt ?? null,
        redeemedByActorType: params.redeemedAt ? "CONSUMER" : null,
        redeemedByUserId: params.redeemedAt ? user.id : null,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        reservationId: reservation.id,
        provider: "MOCK",
        merchantOid: `${TAG}-OID-${RUN}-${n}`,
        amountCents: reservation.totalCents,
        status: params.paymentStatus ?? "PAID",
        idempotencyKey: `${TAG}-IDEMP-${RUN}-${n}`,
        paidAt: new Date(params.pickupStartAt.getTime() - 24 * HOUR),
      },
    });
    return { reservation, offer, payment, userId: user.id };
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL! } },
    });
    sweeper = new NoShowSweeperService(prisma as never);

    const merchant = await prisma.merchant.create({
      data: {
        legalName: "No-show Sweep Realdb Gida A.S.",
        tradeName: "No-show Sweep Realdb Firin",
        taxId: `NSSW${RUN}`,
        iban: "TR000006701000000000000009",
        verificationStatus: "APPROVED",
      },
    });
    merchantId = merchant.id;
    const store = await prisma.store.create({
      data: {
        merchantId,
        name: "No-show Sweep Realdb Store",
        address: "Test Sk. No:12",
        district: "Kadikoy",
        city: "Istanbul",
        latitude: 40.99,
        longitude: 29.03,
      },
    });
    storeId = store.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const reservations = await prisma.reservation.findMany({
      where: { storeId },
      select: { id: true, userId: true },
    });
    const reservationIds = reservations.map((r) => r.id);
    const userIds = Array.from(new Set(reservations.map((r) => r.userId)));
    const payments = await prisma.payment.findMany({
      where: { reservationId: { in: reservationIds } },
      select: { id: true },
    });
    await safeCleanup("refund", () =>
      prisma.refund.deleteMany({
        where: { paymentId: { in: payments.map((p) => p.id) } },
      }),
    );
    await safeCleanup("outboxEvent", () =>
      prisma.outboxEvent.deleteMany({
        where: {
          idempotencyKey: {
            in: reservationIds.flatMap((id) => [
              `reservation-redeemed:${id}`,
              `reservation-redeemed-impact:${id}`,
            ]),
          },
        },
      }),
    );
    await safeCleanup("payment", () =>
      prisma.payment.deleteMany({
        where: { reservationId: { in: reservationIds } },
      }),
    );
    await safeCleanup("reservation", () =>
      prisma.reservation.deleteMany({ where: { storeId } }),
    );
    await safeCleanup("dailyOffer", () =>
      prisma.dailyOffer.deleteMany({ where: { storeId } }),
    );
    await safeCleanup("bagTemplate", () =>
      prisma.bagTemplate.deleteMany({ where: { storeId } }),
    );
    await safeCleanup("user", () =>
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    );
    await safeCleanup("store", () =>
      prisma.store.delete({ where: { id: storeId } }),
    );
    await safeCleanup("merchant", () =>
      prisma.merchant.delete({ where: { id: merchantId } }),
    );
    await prisma.$disconnect();
  });

  it("[a] a CONFIRMED reservation whose window closed past the grace becomes NO_SHOW exactly once — a second sweep changes nothing", async () => {
    // Window closed at 09:00, i.e. 3h before SWEEP_NOW — comfortably past
    // the 1h grace.
    const { reservation, offer } = await seedReservation({
      status: "CONFIRMED",
      pickupStartAt: new Date(SWEEP_NOW.getTime() - 4 * HOUR),
      pickupEndAt: new Date(SWEEP_NOW.getTime() - 3 * HOUR),
    });

    await sweeper.sweepOnce(SWEEP_NOW);

    const afterFirst = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(afterFirst.status).toBe("NO_SHOW");
    // A no-show is not a hand-over: nothing about the redemption is
    // fabricated, and the offer's "bags that actually went out of the
    // door" counter is untouched.
    expect(afterFirst.redeemedAt).toBeNull();
    expect(afterFirst.redeemedByActorType).toBeNull();
    expect(
      await prisma.dailyOffer.findUniqueOrThrow({ where: { id: offer.id } }),
    ).toMatchObject({ qtyRedeemed: 0, qtyReserved: 1 });

    // Idempotence, asserted on STORAGE rather than on the sweep's own
    // return count: a second run must not rewrite the row at all, which
    // `updatedAt` (Prisma's @updatedAt) is the honest witness for.
    const secondResult = await sweeper.sweepOnce(
      new Date(SWEEP_NOW.getTime() + HOUR),
    );
    const afterSecond = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(afterSecond.updatedAt).toEqual(afterFirst.updatedAt);
    expect(afterSecond.status).toBe("NO_SHOW");
    // Nothing of OURS was marked twice (the aggregate itself is not a safe
    // assertion target — the query is platform-wide).
    void secondResult;

    // No rating invitation and no impact credit for a bag nobody
    // collected: the sweep publishes no outbox event at all.
    const events = await prisma.outboxEvent.findMany({
      where: {
        idempotencyKey: {
          in: [
            `reservation-redeemed:${reservation.id}`,
            `reservation-redeemed-impact:${reservation.id}`,
          ],
        },
      },
    });
    expect(events).toHaveLength(0);
  }, 20_000);

  it("[b] a reservation still inside its window, and one inside the grace period, are both left alone", async () => {
    const stillOpen = await seedReservation({
      status: "CONFIRMED",
      pickupStartAt: new Date(SWEEP_NOW.getTime() - HOUR),
      pickupEndAt: new Date(SWEEP_NOW.getTime() + HOUR),
    });
    // Closed 30 minutes ago — inside the 1h grace. This is the row a
    // merchant may still be reconciling an offline swipe for.
    const insideGrace = await seedReservation({
      status: "CONFIRMED",
      pickupStartAt: new Date(SWEEP_NOW.getTime() - 2 * HOUR),
      pickupEndAt: new Date(SWEEP_NOW.getTime() - HOUR / 2),
    });

    await sweeper.sweepOnce(SWEEP_NOW);

    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { id: stillOpen.reservation.id },
      }),
    ).toMatchObject({ status: "CONFIRMED" });
    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { id: insideGrace.reservation.id },
      }),
    ).toMatchObject({ status: "CONFIRMED" });

    // ...and the grace is a real boundary, not an accident of this
    // fixture: the same row IS taken once the clock passes it.
    await sweeper.sweepOnce(new Date(SWEEP_NOW.getTime() + HOUR));
    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { id: insideGrace.reservation.id },
      }),
    ).toMatchObject({ status: "NO_SHOW" });
    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { id: stillOpen.reservation.id },
      }),
    ).toMatchObject({ status: "CONFIRMED" });
  }, 20_000);

  it("[c] every status that is not CONFIRMED stays exactly where it is", async () => {
    const longClosed = {
      pickupStartAt: new Date(SWEEP_NOW.getTime() - 30 * HOUR),
      pickupEndAt: new Date(SWEEP_NOW.getTime() - 29 * HOUR),
    };
    const untouchable: ReservationStatus[] = [
      "PENDING_PAYMENT",
      "CANCELLED_BY_USER",
      "CANCELLED_BY_MERCHANT",
      "EXPIRED",
      "REDEEMED",
    ];
    const seeded = await Promise.all(
      untouchable.map((status) =>
        seedReservation({
          status,
          ...longClosed,
          redeemedAt:
            status === "REDEEMED"
              ? new Date(SWEEP_NOW.getTime() - 29.5 * HOUR)
              : undefined,
          paymentStatus: status === "PENDING_PAYMENT" ? "INTENT" : "PAID",
        }),
      ),
    );

    await sweeper.sweepOnce(SWEEP_NOW);

    const after = await prisma.reservation.findMany({
      where: { id: { in: seeded.map((s) => s.reservation.id) } },
      select: { id: true, status: true },
    });
    expect(
      after
        .map((r) => r.status)
        .sort()
        .join(","),
    ).toBe([...untouchable].sort().join(","));
  }, 20_000);

  it("[d] a bag that was actually collected is never taken — a redeem landing before the sweep wins, and a genuine race never double-effects", async () => {
    // redeem()'s window check reads the real wall clock and cannot be
    // injected, so THIS fixture's window has to straddle real `now`; the
    // sweep is then run against a simulated clock long past it, which is
    // exactly the "the sweeper caught up later" shape.
    const realNow = Date.now();
    const collected = await seedReservation({
      status: "CONFIRMED",
      pickupStartAt: new Date(realNow - HOUR),
      pickupEndAt: new Date(realNow + HOUR),
    });
    const { service } = buildReservationsHarness(prisma);

    const redeemed = await service.redeem(
      { actorType: "CONSUMER", userId: collected.userId },
      collected.reservation.id,
    );
    expect(redeemed.status).toBe("REDEEMED");

    await sweeper.sweepOnce(new Date(realNow + 10 * HOUR));

    const afterSweep = await prisma.reservation.findUniqueOrThrow({
      where: { id: collected.reservation.id },
    });
    expect(afterSweep.status).toBe("REDEEMED");
    expect(afterSweep.redeemedAt).toEqual(redeemed.redeemedAt);

    // The genuine race: a redeem and a sweep hitting the SAME row at the
    // same time. Exactly one may apply. Which one wins is a real property
    // of the commit order and is not asserted; what IS asserted is that
    // the two effects are never mixed — the guarded update means a NO_SHOW
    // row can never also carry a redemption, and a REDEEMED row's
    // hand-over counter is always incremented exactly once.
    const raced = await seedReservation({
      status: "CONFIRMED",
      pickupStartAt: new Date(realNow - HOUR),
      pickupEndAt: new Date(realNow + HOUR),
    });
    const [redeemOutcome] = await Promise.allSettled([
      service.redeem(
        { actorType: "CONSUMER", userId: raced.userId },
        raced.reservation.id,
      ),
      sweeper.sweepOnce(new Date(realNow + 10 * HOUR)),
    ]);

    const afterRace = await prisma.reservation.findUniqueOrThrow({
      where: { id: raced.reservation.id },
    });
    const offerAfterRace = await prisma.dailyOffer.findUniqueOrThrow({
      where: { id: raced.offer.id },
    });
    if (afterRace.status === "REDEEMED") {
      expect(redeemOutcome.status).toBe("fulfilled");
      expect(afterRace.redeemedAt).not.toBeNull();
      expect(offerAfterRace.qtyRedeemed).toBe(1);
    } else {
      expect(afterRace.status).toBe("NO_SHOW");
      expect(redeemOutcome.status).toBe("rejected");
      expect(afterRace.redeemedAt).toBeNull();
      expect(offerAfterRace.qtyRedeemed).toBe(0);
    }
  }, 30_000);

  it("[e] two concurrent sweeps over the SAME row transition it exactly once", async () => {
    const { reservation } = await seedReservation({
      status: "CONFIRMED",
      pickupStartAt: new Date(SWEEP_NOW.getTime() - 6 * HOUR),
      pickupEndAt: new Date(SWEEP_NOW.getTime() - 5 * HOUR),
    });

    await Promise.all([
      sweeper.sweepOnce(SWEEP_NOW),
      sweeper.sweepOnce(SWEEP_NOW),
    ]);

    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(after.status).toBe("NO_SHOW");
    // The row was written by exactly one of the two racers: a second
    // write would have moved `updatedAt` past the first one's, and a
    // guarded update that matched twice would have been a transition out
    // of a terminal status — which the transitions table forbids.
    const rewritten = await sweeper.sweepOnce(SWEEP_NOW);
    void rewritten;
    const afterThird = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(afterThird.updatedAt).toEqual(after.updatedAt);
  }, 20_000);

  it("[f] no automatic or customer-initiated path refunds a NO_SHOW — the money stays with the sale", async () => {
    const swept = await seedReservation({
      status: "CONFIRMED",
      pickupStartAt: new Date(SWEEP_NOW.getTime() - 8 * HOUR),
      pickupEndAt: new Date(SWEEP_NOW.getTime() - 7 * HOUR),
    });
    await sweeper.sweepOnce(SWEEP_NOW);
    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { id: swept.reservation.id },
      }),
    ).toMatchObject({ status: "NO_SHOW" });

    const { service, mockProvider } = buildReservationsHarness(prisma);

    // (1) The consumer cancel endpoint.
    await expect(
      service.cancel(swept.userId, swept.reservation.id),
    ).rejects.toMatchObject({
      response: { errorCode: "RESERVATION_NOT_CANCELLABLE" },
    });

    // (2) The merchant-cancel / suspend kill-switch fan-out over the whole
    // offer — a NO_SHOW is not even a candidate.
    const fanOut = await prisma.$transaction((tx) =>
      service.cancelAllForOffer(tx, swept.offer.id),
    );
    expect(fanOut.toRefund).toHaveLength(0);

    // Nothing reached the provider, no Refund row was written, and the
    // payment is still PAID — the sale stands, which is what makes the
    // merchant's settlement for it legitimate.
    expect(
      mockProvider
        .getRefundLog()
        .filter((r) => r.merchantOid === swept.payment.merchantOid),
    ).toHaveLength(0);
    expect(
      await prisma.refund.count({ where: { paymentId: swept.payment.id } }),
    ).toBe(0);
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { id: swept.payment.id },
      }),
    ).toMatchObject({ status: "PAID" });
    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { id: swept.reservation.id },
      }),
    ).toMatchObject({ status: "NO_SHOW" });
  }, 30_000);

  it("[g] an admin CAN refund a NO_SHOW — 'the shop was shut' ends in the same status as 'the customer never came'", async () => {
    // The sweeper cannot tell those two apart from the outside: both are a
    // CONFIRMED reservation whose window closed uncollected. Deciding
    // which happened is what an admin reviewing a complaint is for, and
    // before this the answer could never be acted on — the seeded demo's
    // own STORE_CLOSED_NO_SHOW complaint was unanswerable.
    const swept = await seedReservation({
      status: "CONFIRMED",
      pickupStartAt: new Date(SWEEP_NOW.getTime() - 8 * HOUR),
      pickupEndAt: new Date(SWEEP_NOW.getTime() - 7 * HOUR),
    });
    await sweeper.sweepOnce(SWEEP_NOW);

    const { service, mockProvider } = buildReservationsHarness(prisma);
    // The payment row is seeded straight into the DB, so the provider has
    // never seen this merchantOid — give it the intent a real purchase
    // would have created.
    mockProvider.seedIntent(
      swept.payment.merchantOid,
      swept.payment.amountCents,
    );
    const sonuc = await service.refundRedeemed(swept.reservation.id);
    expect(sonuc.ok).toBe(true);

    expect(
      mockProvider
        .getRefundLog()
        .filter((r) => r.merchantOid === swept.payment.merchantOid),
    ).toHaveLength(1);
    expect(
      await prisma.refund.count({
        where: {
          paymentId: swept.payment.id,
          status: { in: ["DONE", "SENT"] },
        },
      }),
    ).toBe(1);
    // The reservation stays NO_SHOW — the refund is a money event, not a
    // rewriting of what happened at the counter. The clawback ledger keys
    // on settlement_lines -> payments -> refunds, so a settled no-show is
    // recovered from the merchant's next batch exactly as a redeemed one
    // would be.
    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { id: swept.reservation.id },
      }),
    ).toMatchObject({ status: "NO_SHOW" });
  }, 30_000);
});
