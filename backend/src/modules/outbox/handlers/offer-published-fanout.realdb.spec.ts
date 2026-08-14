import { PrismaClient } from "@prisma/client";
import { OfferPublishedHandler } from "./offer-published.handler";
import { OutboxHandlerRegistry } from "../outbox-handler.registry";
import { PushDispatchService } from "../../notifications/push/push-dispatch.service";
import { PushFacadeService } from "../../notifications/push/push-facade.service";
import { PushProviderRegistry } from "../../notifications/push/push-provider.registry";
import { MockPushProvider } from "../../notifications/push/adapters/mock-push-provider";
import { NotificationPolicyService } from "../../notifications/notification-policy.service";
import { istanbulHourOfDay } from "../../../common/utils/istanbul-date.util";
import { OfferPublishedV1Payload } from "../event-types";

/**
 * Real-DB proof of offer.published.v1's fan-out (brief §5/§7-b) — picks
 * exactly the favoriters + in-radius nearby users, and excludes every
 * disqualifying condition the brief lists: opted-out preference, quiet
 * hours, a disabledAt push token, and a BANNED user. Calls
 * OfferPublishedHandler.handle() directly (a constructed payload, not
 * routed through the outbox worker) — the worker's own claim/dispatch
 * mechanics are proven separately (outbox-worker.realdb.spec.ts); this
 * file is scoped to the fan-out AUDIENCE logic itself, mirroring how
 * discovery-radius.realdb.spec.ts calls DiscoveryService directly rather
 * than through a controller. Only runs when TEST_DATABASE_URL is set.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const PHONE_PREFIX = "+9055517";

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
  const handler = new OfferPublishedHandler(
    prisma as any,
    pushDispatch,
    new OutboxHandlerRegistry(),
  );
  return { handler, mockProvider };
}

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[offer-published-fanout.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

let userSeedCounter = 0;
async function seedUser(
  prisma: PrismaClient,
  opts: {
    status?: "ACTIVE" | "BANNED";
    lastLat?: number;
    lastLng?: number;
  } = {},
) {
  const n = userSeedCounter++;
  return prisma.user.create({
    data: {
      phoneE164: `${PHONE_PREFIX}${n.toString().padStart(5, "0")}`,
      status: opts.status ?? "ACTIVE",
      lastLat: opts.lastLat,
      lastLng: opts.lastLng,
      lastLocationAt: opts.lastLat !== undefined ? new Date() : undefined,
    },
  });
}

async function seedToken(
  prisma: PrismaClient,
  userId: string,
  token: string,
  disabled = false,
) {
  return prisma.pushToken.create({
    data: {
      userId,
      expoPushToken: token,
      platform: "IOS",
      lastSeenAt: new Date(),
      disabledAt: disabled ? new Date() : null,
    },
  });
}

d("OfferPublishedHandler.handle — real DB fan-out audience", () => {
  let prisma: PrismaClient;
  let merchantId: string;
  let storeId: string;
  let bagTemplateId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL! } },
    });

    const merchant = await prisma.merchant.create({
      data: {
        legalName: "Fanout Realdb Test Gida A.S.",
        tradeName: "Fanout Realdb Test Firin",
        taxId: `FNOT${Date.now()}`.slice(0, 10),
        iban: "TR000006701000000000000004",
        verificationStatus: "APPROVED",
      },
    });
    merchantId = merchant.id;

    const store = await prisma.store.create({
      data: {
        merchantId,
        name: "Fanout Realdb Test Store",
        address: "Test Sk. No:9",
        district: "Kadikoy",
        city: "Istanbul",
        latitude: 41.0,
        longitude: 29.0,
      },
    });
    storeId = store.id;
    await prisma.$executeRaw`
      UPDATE "stores"
      SET "location" = ST_SetSRID(ST_MakePoint(${store.longitude}, ${store.latitude}), 4326)::geography
      WHERE "id" = ${store.id}
    `;

    const bagTemplate = await prisma.bagTemplate.create({
      data: {
        storeId,
        title: "Fanout Realdb Test Bag",
        category: "BAKERY",
        allergenDisclaimer: "N/A",
        originalValueCentsMin: 10000,
        originalValueCentsMax: 20000,
        priceCents: 5000,
      },
    });
    bagTemplateId = bagTemplate.id;

    // A 1° latitude offset is ~111.32km — comfortably inside a 5000m
    // "nearby" test and comfortably outside a 500m one.
    const NEAR_LAT = 41.001; // ~111m from the store
    const FAR_LAT = 41.05; // ~5.5km from the store

    const nowHour = istanbulHourOfDay(new Date());
    // A [nowHour, nowHour+1) window ALWAYS contains "now" regardless of
    // what wall-clock hour this test actually runs at — no sleep needed,
    // matches offer-date-uniqueness.realdb.spec.ts's "compute relative to
    // real now()" fixture style. Wraps correctly at hour 23 (isWithinQuietHours
    // handles start>end).
    const quietStart = nowHour;
    const quietEnd = (nowHour + 1) % 24;

    // (1) Favoriter, no preference row at all -> favoritesEnabled defaults
    // TRUE -> should receive.
    const favDefault = await seedUser(prisma);
    // (2) Favoriter, favoritesEnabled explicitly FALSE -> excluded.
    const favOptedOut = await seedUser(prisma);
    // (3) Favoriter, inside quiet hours right now -> excluded.
    const favQuietHours = await seedUser(prisma);
    // (4) Favoriter, BANNED -> excluded regardless of preferences.
    const favBanned = await seedUser(prisma, { status: "BANNED" });
    // (5) Favoriter, allowed by policy but their ONLY token is disabledAt
    // -> excluded (never sent to a disabled token).
    const favDisabledToken = await seedUser(prisma);
    // (6) Nearby, opted in, within radius, NOT a favoriter -> should
    // receive via OFFER_NEARBY.
    const nearbyIn = await seedUser(prisma, {
      lastLat: NEAR_LAT,
      lastLng: store.longitude,
    });
    // (7) Nearby location but NO preference row -> nearbyEnabled defaults
    // FALSE (opt-in) -> excluded.
    const nearbyNoOptIn = await seedUser(prisma, {
      lastLat: NEAR_LAT,
      lastLng: store.longitude,
    });
    // (8) Nearby opted in but FAR outside the radius -> excluded by the
    // ST_DWithin query itself.
    const nearbyOutOfRadius = await seedUser(prisma, {
      lastLat: FAR_LAT,
      lastLng: store.longitude,
    });
    // (9) BOTH a favoriter AND within nearby radius+opted in -> exactly
    // ONE push (dedup), via OFFER_FAVORITE precedence.
    const favAndNearby = await seedUser(prisma, {
      lastLat: NEAR_LAT,
      lastLng: store.longitude,
    });

    userIds.push(
      favDefault.id,
      favOptedOut.id,
      favQuietHours.id,
      favBanned.id,
      favDisabledToken.id,
      nearbyIn.id,
      nearbyNoOptIn.id,
      nearbyOutOfRadius.id,
      favAndNearby.id,
    );

    await prisma.favorite.createMany({
      data: [
        { userId: favDefault.id, storeId },
        { userId: favOptedOut.id, storeId },
        { userId: favQuietHours.id, storeId },
        { userId: favBanned.id, storeId },
        { userId: favDisabledToken.id, storeId },
        { userId: favAndNearby.id, storeId },
      ],
    });

    await prisma.notificationPreference.createMany({
      data: [
        { userId: favOptedOut.id, favoritesEnabled: false },
        {
          userId: favQuietHours.id,
          favoritesEnabled: true,
          quietHoursStart: quietStart,
          quietHoursEnd: quietEnd,
        },
        { userId: favDisabledToken.id, favoritesEnabled: true },
        { userId: nearbyIn.id, nearbyEnabled: true, nearbyRadiusM: 5000 },
        {
          userId: nearbyOutOfRadius.id,
          nearbyEnabled: true,
          nearbyRadiusM: 500,
        },
        {
          userId: favAndNearby.id,
          favoritesEnabled: true,
          nearbyEnabled: true,
          nearbyRadiusM: 5000,
        },
      ],
    });

    await Promise.all([
      seedToken(prisma, favDefault.id, "tok-fav-default"),
      seedToken(prisma, favOptedOut.id, "tok-fav-opted-out"),
      seedToken(prisma, favQuietHours.id, "tok-fav-quiet-hours"),
      seedToken(prisma, favBanned.id, "tok-fav-banned"),
      seedToken(prisma, favDisabledToken.id, "tok-fav-disabled", true),
      seedToken(prisma, nearbyIn.id, "tok-nearby-in"),
      seedToken(prisma, nearbyNoOptIn.id, "tok-nearby-no-optin"),
      seedToken(prisma, nearbyOutOfRadius.id, "tok-nearby-out-of-radius"),
      seedToken(prisma, favAndNearby.id, "tok-fav-and-nearby"),
    ]);
  });

  afterAll(async () => {
    if (!prisma) return;
    await safeCleanup("pushToken", () =>
      prisma.pushToken.deleteMany({ where: { userId: { in: userIds } } }),
    );
    await safeCleanup("notificationPreference", () =>
      prisma.notificationPreference.deleteMany({
        where: { userId: { in: userIds } },
      }),
    );
    await safeCleanup("favorite", () =>
      prisma.favorite.deleteMany({ where: { storeId } }),
    );
    await safeCleanup("user", () =>
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    );
    await safeCleanup("bagTemplate", () =>
      prisma.bagTemplate.deleteMany({ where: { storeId } }),
    );
    await safeCleanup("store", () =>
      prisma.store.delete({ where: { id: storeId } }),
    );
    await safeCleanup("merchant", () =>
      prisma.merchant.delete({ where: { id: merchantId } }),
    );
    await prisma.$disconnect();
  });

  it("sends exactly to the qualifying favoriters + nearby users, deduped, excluding every disqualified case", async () => {
    const { handler, mockProvider } = buildHarness(prisma);
    const payload: OfferPublishedV1Payload = {
      offerId: "fake-offer-id-for-fanout-test",
      storeId,
      bagTemplateId,
      publishedAt: new Date().toISOString(),
    };

    await handler.handle(payload);

    const sentTokens = mockProvider.getSentLog().map((m) => m.to);

    expect(new Set(sentTokens)).toEqual(
      new Set(["tok-fav-default", "tok-nearby-in", "tok-fav-and-nearby"]),
    );
    // Dedup proof: favAndNearby's token appears exactly ONCE, not twice
    // (once per audience) — a duplicate would silently double-notify.
    expect(sentTokens.filter((t) => t === "tok-fav-and-nearby")).toHaveLength(
      1,
    );

    // Every excluded case explicitly did NOT get a push.
    for (const excludedToken of [
      "tok-fav-opted-out",
      "tok-fav-quiet-hours",
      "tok-fav-banned",
      "tok-fav-disabled",
      "tok-nearby-no-optin",
      "tok-nearby-out-of-radius",
    ]) {
      expect(sentTokens).not.toContain(excludedToken);
    }
  }, 15_000);
});
