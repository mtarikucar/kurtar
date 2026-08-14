import { PrismaClient } from "@prisma/client";
import { PickupReminderCronService } from "./pickup-reminder-cron.service";
import { PushDispatchService } from "../notifications/push/push-dispatch.service";
import { PushFacadeService } from "../notifications/push/push-facade.service";
import { PushProviderRegistry } from "../notifications/push/push-provider.registry";
import { MockPushProvider } from "../notifications/push/adapters/mock-push-provider";
import { NotificationPolicyService } from "../notifications/notification-policy.service";

/**
 * Real-DB proof of the pickup-reminder cron (brief §5/§7-d): "sends once
 * and only once for the same reservation" — proven as a genuine
 * concurrency race (two overlapping sweepOnce() calls against the SAME
 * due reservation, not just two sequential calls) against real Postgres,
 * matching this codebase's established race-proof style
 * (reservations.realdb.spec.ts's redeem-idempotency test is the closest
 * analogue: same guarded-updateMany claim pattern). No sleeps — the
 * pickup window is expressed relative to an explicit `now` both the
 * fixture and the sweep call share. Only runs when TEST_DATABASE_URL is
 * set.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const PHONE_PREFIX = "+9055518";

function buildHarness(prisma: PrismaClient) {
  const pushRegistry = new PushProviderRegistry();
  const mockProvider = new MockPushProvider(pushRegistry);
  mockProvider.onModuleInit();
  const config = {
    get: (key: string) => ({ PUSH_PROVIDER: "mock" })[key],
  } as any;
  const facade = new PushFacadeService(pushRegistry, config);
  const policy = new NotificationPolicyService(prisma as any);
  const pushDispatch = new PushDispatchService(prisma as any, facade, policy);
  const service = new PickupReminderCronService(prisma as any, pushDispatch);
  return { service, mockProvider };
}

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[pickup-reminder-cron.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

d("PickupReminderCronService.sweepOnce — real DB concurrency", () => {
  let prisma: PrismaClient;
  let merchantId: string;
  let storeId: string;
  let userId: string;
  let reservationId: string;
  let farReservationId: string;
  const now = new Date();

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL! } },
    });

    const merchant = await prisma.merchant.create({
      data: {
        legalName: "Pickup Reminder Realdb Test Gida A.S.",
        tradeName: "Pickup Reminder Realdb Test Firin",
        taxId: `PKRT${Date.now()}`.slice(0, 10),
        iban: "TR000006701000000000000005",
        verificationStatus: "APPROVED",
      },
    });
    merchantId = merchant.id;

    const store = await prisma.store.create({
      data: {
        merchantId,
        name: "Pickup Reminder Realdb Test Store",
        address: "Test Sk. No:10",
        district: "Kadikoy",
        city: "Istanbul",
        latitude: 40.99,
        longitude: 29.03,
      },
    });
    storeId = store.id;

    const bagTemplate = await prisma.bagTemplate.create({
      data: {
        storeId,
        title: "Pickup Reminder Realdb Test Bag",
        category: "BAKERY",
        allergenDisclaimer: "N/A",
        originalValueCentsMin: 10000,
        originalValueCentsMax: 20000,
        priceCents: 5000,
      },
    });

    // Pickup window opens in 20 minutes from `now` — inside the cron's
    // default 30-minute lookahead.
    const pickupStartAt = new Date(now.getTime() + 20 * 60 * 1000);
    const pickupEndAt = new Date(now.getTime() + 80 * 60 * 1000);
    const offer = await prisma.dailyOffer.create({
      data: {
        bagTemplateId: bagTemplate.id,
        storeId,
        offerDate: new Date(pickupStartAt.toISOString().slice(0, 10)),
        qtyTotal: 5,
        qtyReserved: 1,
        pickupStartAt,
        pickupEndAt,
        status: "PUBLISHED",
        publishedAt: now,
      },
    });

    const user = await prisma.user.create({
      data: { phoneE164: `${PHONE_PREFIX}00001` },
    });
    userId = user.id;
    await prisma.pushToken.create({
      data: {
        userId,
        expoPushToken: "tok-pickup-reminder",
        platform: "IOS",
        lastSeenAt: now,
      },
    });

    const reservation = await prisma.reservation.create({
      data: {
        code: `PKRT${Date.now()}`.slice(0, 12),
        userId,
        offerId: offer.id,
        storeId,
        qty: 1,
        unitPriceCents: 5000,
        totalCents: 5000,
        status: "CONFIRMED",
        cancelDeadlineAt: new Date(
          pickupStartAt.getTime() - 2 * 60 * 60 * 1000,
        ),
      },
    });
    reservationId = reservation.id;

    // A SEPARATE reservation whose pickup window is 2h out — used only by
    // the "outside the window" test below, so that test's assertion can't
    // be satisfied for the wrong reason (the near-term reservation above
    // getting reminded-and-thus-excluded by an earlier test in this file).
    // Its own BagTemplate: the near-term offer above likely shares today's
    // calendar date with this one, and (bagTemplateId, offerDate) is
    // unique — reusing the same template would collide.
    const farBagTemplate = await prisma.bagTemplate.create({
      data: {
        storeId,
        title: "Pickup Reminder Realdb Test Bag (far)",
        category: "BAKERY",
        allergenDisclaimer: "N/A",
        originalValueCentsMin: 10000,
        originalValueCentsMax: 20000,
        priceCents: 5000,
      },
    });
    const farPickupStartAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const farOffer = await prisma.dailyOffer.create({
      data: {
        bagTemplateId: farBagTemplate.id,
        storeId,
        offerDate: new Date(farPickupStartAt.toISOString().slice(0, 10)),
        qtyTotal: 5,
        qtyReserved: 1,
        pickupStartAt: farPickupStartAt,
        pickupEndAt: new Date(farPickupStartAt.getTime() + 60 * 60 * 1000),
        status: "PUBLISHED",
        publishedAt: now,
      },
    });
    const farReservation = await prisma.reservation.create({
      data: {
        code: `PKRF${Date.now()}`.slice(0, 12),
        userId,
        offerId: farOffer.id,
        storeId,
        qty: 1,
        unitPriceCents: 5000,
        totalCents: 5000,
        status: "CONFIRMED",
        cancelDeadlineAt: new Date(
          farPickupStartAt.getTime() - 2 * 60 * 60 * 1000,
        ),
      },
    });
    farReservationId = farReservation.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await safeCleanup("pushToken", () =>
      prisma.pushToken.deleteMany({ where: { userId } }),
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
      prisma.user.deleteMany({ where: { id: userId } }),
    );
    await safeCleanup("store", () =>
      prisma.store.delete({ where: { id: storeId } }),
    );
    await safeCleanup("merchant", () =>
      prisma.merchant.delete({ where: { id: merchantId } }),
    );
    await prisma.$disconnect();
  });

  it("two concurrent sweeps over the SAME due reservation send the reminder exactly once", async () => {
    const { service, mockProvider } = buildHarness(prisma);

    const [resultA, resultB] = await Promise.all([
      service.sweepOnce(now),
      service.sweepOnce(now),
    ]);

    expect(resultA.reminded + resultB.reminded).toBe(1);
    expect(mockProvider.getSentLog().map((m) => m.to)).toEqual([
      "tok-pickup-reminder",
    ]);

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    expect(reservation.pickupReminderSentAt).not.toBeNull();

    // A THIRD sweep, later, must still be a no-op — "once and only once",
    // not just "the two racers agreed".
    const resultC = await service.sweepOnce(now);
    expect(resultC.reminded).toBe(0);
    expect(mockProvider.getSentLog()).toHaveLength(1);
  }, 15_000);

  it("a reservation whose pickup window is 2h out is left untouched by the default 30-minute lookahead", async () => {
    const { service } = buildHarness(prisma);

    await service.sweepOnce(now);

    const farReservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: farReservationId },
    });
    expect(farReservation.pickupReminderSentAt).toBeNull();
  }, 15_000);
});
