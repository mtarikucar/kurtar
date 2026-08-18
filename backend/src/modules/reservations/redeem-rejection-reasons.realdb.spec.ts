import { ConfigService } from "@nestjs/config";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { PrismaClient, ReservationStatus } from "@prisma/client";
import { ReservationsService } from "./reservations.service";
import { OfferStockService } from "./offer-stock.service";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { OutboxService } from "../outbox/outbox.service";

/**
 * [Cross-lane fix, I9] The redeem screen is this product's defining
 * interaction: the customer swipes in front of shop staff. Every refusal
 * used to collapse into ONE code — `RESERVATION_NOT_REDEEMABLE`, rendered
 * as "Bu sipariş şu anda teslim alınamıyor" — regardless of whether the
 * window had not opened yet, had closed, the merchant had pulled the
 * offer, the payment never completed, or the reservation belonged to
 * somebody else. The server distinguished all of those internally and
 * said none of it.
 *
 * This suite pins one code per reason, plus the two pickup-window columns
 * `GET /reservations/mine` now returns so the screen can state the window
 * it is being judged against even on a device with no local snapshot.
 *
 * Real DB (not mocks): the pickup window is joined from `daily_offers` in
 * a RAW query, so a mocked `$queryRaw` would assert nothing about whether
 * the join actually produces the columns. Every row this suite creates is
 * scoped to its own store/user prefix and deleted by that scope —
 * never a table-wide `deleteMany({})`.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "redeem-reason-realdb";
const PHONE_PREFIX = "+9055517";

function harness(prisma: PrismaClient) {
  const registry = new PaymentProviderRegistry();
  const config = {
    get: (key: string) =>
      ({ WEBHOOK_SECRET: `${TAG}-secret`, PAYMENT_PROVIDER: "mock" })[key],
  } as unknown as ConfigService;
  const provider = new MockPaymentProvider(config, registry);
  provider.onModuleInit();
  return new ReservationsService(
    prisma as never,
    new OfferStockService(),
    new PaymentsFacadeService(registry, config),
    new OutboxService(),
  );
}

d("redeem — one error code per refusal reason", () => {
  let prisma: PrismaClient;
  let service: ReservationsService;
  let merchantId: string;
  let storeId: string;
  let bagTemplateId: string;
  let userId: string;
  let otherUserId: string;
  let offerCounter = 0;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    service = harness(prisma);

    const merchant = await prisma.merchant.create({
      data: {
        legalName: "Redeem Reason Test A.S.",
        tradeName: "Redeem Reason Test",
        taxId: `${TAG}-${Date.now()}`,
        iban: "TR000006701000000000000002",
        verificationStatus: "APPROVED",
      },
    });
    merchantId = merchant.id;
    const store = await prisma.store.create({
      data: {
        merchantId,
        name: "Redeem Reason Store",
        address: "Test Sk. No:9",
        district: "Kadikoy",
        city: "Istanbul",
        latitude: 40.99,
        longitude: 29.03,
      },
    });
    storeId = store.id;
    const template = await prisma.bagTemplate.create({
      data: {
        storeId,
        title: "Redeem Reason Bag",
        category: "BAKERY",
        allergenDisclaimer: "N/A",
        originalValueCentsMin: 10000,
        originalValueCentsMax: 20000,
        priceCents: 5000,
      },
    });
    bagTemplateId = template.id;
    const [owner, other] = await Promise.all([
      prisma.user.create({ data: { phoneE164: `${PHONE_PREFIX}00001` } }),
      prisma.user.create({ data: { phoneE164: `${PHONE_PREFIX}00002` } }),
    ]);
    userId = owner.id;
    otherUserId = other.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.reservation.deleteMany({ where: { storeId } });
    await prisma.dailyOffer.deleteMany({ where: { storeId } });
    await prisma.bagTemplate.deleteMany({ where: { storeId } });
    await prisma.store.delete({ where: { id: storeId } });
    await prisma.merchant.delete({ where: { id: merchantId } });
    await prisma.user.deleteMany({
      where: { phoneE164: { startsWith: PHONE_PREFIX } },
    });
    await prisma.$disconnect();
  });

  /** One offer + one reservation, with a pickup window placed relative to
   * now and a status chosen by the caller. Each call gets its own
   * offerDate so the (bagTemplateId, offerDate) unique pair can never
   * collide between cases. */
  async function seed(opts: {
    status: ReservationStatus;
    startsInMs: number;
    endsInMs: number;
    ownedBy?: string;
  }) {
    const pickupStartAt = new Date(Date.now() + opts.startsInMs);
    const pickupEndAt = new Date(Date.now() + opts.endsInMs);
    const offerDate = new Date(Date.UTC(2027, 0, 1 + offerCounter++));
    const offer = await prisma.dailyOffer.create({
      data: {
        bagTemplateId,
        storeId,
        offerDate,
        qtyTotal: 5,
        pickupStartAt,
        pickupEndAt,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    const reservation = await prisma.reservation.create({
      data: {
        code: `${TAG.slice(0, 4).toUpperCase()}-${offerCounter}-${Date.now() % 100000}`,
        userId: opts.ownedBy ?? userId,
        offerId: offer.id,
        storeId,
        qty: 1,
        unitPriceCents: 5000,
        totalCents: 5000,
        status: opts.status,
        cancelDeadlineAt: new Date(pickupStartAt.getTime() - 7_200_000),
      },
    });
    return { offer, reservation, pickupStartAt, pickupEndAt };
  }

  const consumer = () => ({ actorType: "CONSUMER" as const, userId });

  async function refusalFor(reservationId: string) {
    return service
      .redeem(consumer(), reservationId)
      .then(() => null)
      .catch((err: unknown) => err);
  }

  it("too early -> RESERVATION_PICKUP_NOT_STARTED, carrying the window itself", async () => {
    const { reservation, pickupStartAt, pickupEndAt } = await seed({
      status: "CONFIRMED",
      startsInMs: 60 * 60 * 1000,
      endsInMs: 3 * 60 * 60 * 1000,
    });
    const err = (await refusalFor(reservation.id)) as ConflictException;
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      statusCode: 409,
      errorCode: "RESERVATION_PICKUP_NOT_STARTED",
      pickupStartAt: pickupStartAt.toISOString(),
      pickupEndAt: pickupEndAt.toISOString(),
    });
  });

  it("too late -> RESERVATION_PICKUP_WINDOW_PASSED, a DIFFERENT code from too-early", async () => {
    const { reservation, pickupEndAt } = await seed({
      status: "CONFIRMED",
      startsInMs: -3 * 60 * 60 * 1000,
      endsInMs: -60 * 60 * 1000,
    });
    const err = (await refusalFor(reservation.id)) as ConflictException;
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      errorCode: "RESERVATION_PICKUP_WINDOW_PASSED",
      pickupEndAt: pickupEndAt.toISOString(),
    });
  });

  it("the merchant pulled the offer -> RESERVATION_CANCELLED_BY_MERCHANT, not the customer's own cancel code", async () => {
    const { reservation } = await seed({
      status: "CANCELLED_BY_MERCHANT",
      startsInMs: -60 * 1000,
      endsInMs: 60 * 60 * 1000,
    });
    const err = (await refusalFor(reservation.id)) as ConflictException;
    expect(err.getResponse()).toMatchObject({
      errorCode: "RESERVATION_CANCELLED_BY_MERCHANT",
    });
  });

  it("the customer cancelled it themselves -> RESERVATION_CANCELLED_BY_USER", async () => {
    const { reservation } = await seed({
      status: "CANCELLED_BY_USER",
      startsInMs: -60 * 1000,
      endsInMs: 60 * 60 * 1000,
    });
    const err = (await refusalFor(reservation.id)) as ConflictException;
    expect(err.getResponse()).toMatchObject({
      errorCode: "RESERVATION_CANCELLED_BY_USER",
    });
  });

  it("payment never completed -> RESERVATION_PAYMENT_INCOMPLETE; expired -> RESERVATION_EXPIRED", async () => {
    const pending = await seed({
      status: "PENDING_PAYMENT",
      startsInMs: -60 * 1000,
      endsInMs: 60 * 60 * 1000,
    });
    const expired = await seed({
      status: "EXPIRED",
      startsInMs: -60 * 1000,
      endsInMs: 60 * 60 * 1000,
    });
    const pendingErr = (await refusalFor(
      pending.reservation.id,
    )) as ConflictException;
    const expiredErr = (await refusalFor(
      expired.reservation.id,
    )) as ConflictException;
    expect(pendingErr.getResponse()).toMatchObject({
      errorCode: "RESERVATION_PAYMENT_INCOMPLETE",
    });
    expect(expiredErr.getResponse()).toMatchObject({
      errorCode: "RESERVATION_EXPIRED",
    });
  });

  it("somebody else's reservation -> 403 RESERVATION_NOT_YOURS, not the bare FORBIDDEN every other 403 collapses into", async () => {
    const { reservation } = await seed({
      status: "CONFIRMED",
      startsInMs: -60 * 1000,
      endsInMs: 60 * 60 * 1000,
      ownedBy: otherUserId,
    });
    const err = (await refusalFor(reservation.id)) as ForbiddenException;
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({
      statusCode: 403,
      errorCode: "RESERVATION_NOT_YOURS",
    });
  });

  it("already redeemed stays an idempotent SUCCESS — it is not one of the error codes", async () => {
    const { reservation } = await seed({
      status: "CONFIRMED",
      startsInMs: -60 * 1000,
      endsInMs: 60 * 60 * 1000,
    });
    const redeemedAt = new Date();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "REDEEMED", redeemedAt },
    });
    await expect(
      service.redeem(consumer(), reservation.id),
    ).resolves.toMatchObject({
      reservationId: reservation.id,
      status: "REDEEMED",
    });
  });

  it("GET /reservations/mine carries the offer's real pickup window on every row", async () => {
    const { reservation, pickupStartAt, pickupEndAt } = await seed({
      status: "CONFIRMED",
      startsInMs: 30 * 60 * 1000,
      endsInMs: 90 * 60 * 1000,
    });
    const listed = await service.listMine(userId, 1, 100);
    const row = listed.items.find((r) => r.id === reservation.id);
    expect(row).toBeDefined();
    // The exact instants from daily_offers, not a client-side derivation
    // off cancelDeadlineAt (which had no end time at all).
    expect(row!.pickupStartAt.toISOString()).toBe(pickupStartAt.toISOString());
    expect(row!.pickupEndAt.toISOString()).toBe(pickupEndAt.toISOString());
    // ...and the reservation's own columns still come back untouched by
    // the join.
    expect(row!.code).toBe(reservation.code);
    expect(row!.totalCents).toBe(5000);
  });
});
