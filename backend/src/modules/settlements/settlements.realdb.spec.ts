import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { OutboxService } from "../outbox/outbox.service";
import { PublicHolidayService } from "./public-holiday.service";
import { PricingService } from "./pricing.service";
import { MembershipOffsetService } from "../memberships/membership-offset.service";
import { SettlementBatchBuilderService } from "./settlement-batch-builder.service";
import { SettlementPayoutService } from "./settlement-payout.service";
import { SettlementsService } from "./settlements.service";

/**
 * Real-DB proof of the settlement engine's five hardest guarantees (brief
 * §7's five mandatory realdb scenarios), all sharing one harness — mirrors
 * reservations.realdb.spec.ts grouping several race scenarios in one file.
 * Every service is constructed directly (not via Nest's DI container),
 * exactly like reservations.realdb.spec.ts's buildReservationsHarness.
 *
 * [I8] Every seeded row is scoped under one of this file's own tag
 * prefixes (SETTLEMENTS_TEST_TAG in taxId/code/phone) and cleaned up by
 * merchantId in afterAll — never a table-wide deleteMany — the same
 * discipline reservations.realdb.spec.ts documents for the same reason
 * (Jest's --maxWorkers=2 runs test FILES in true parallel processes
 * against the SAME database).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const SETTLEMENTS_TEST_TAG = "settlements-realdb-test";
const WEBHOOK_SECRET = "settlements-realdb-webhook-secret";

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[settlements.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

function buildHarness(prisma: PrismaClient) {
  const holidays = new PublicHolidayService(prisma as never);
  const pricing = new PricingService(prisma as never);
  const membershipOffset = new MembershipOffsetService();
  const batchBuilder = new SettlementBatchBuilderService(
    prisma as never,
    holidays,
    pricing,
    membershipOffset,
  );

  const registry = new PaymentProviderRegistry();
  const config = {
    get: (key: string) => ({ WEBHOOK_SECRET, PAYMENT_PROVIDER: "mock" })[key],
  } as unknown as ConfigService;
  const mockProvider = new MockPaymentProvider(config, registry);
  mockProvider.onModuleInit();
  const facade = new PaymentsFacadeService(registry, config);
  const outbox = new OutboxService();
  const payout = new SettlementPayoutService(prisma as never, facade, outbox);
  const settlements = new SettlementsService(
    prisma as never,
    batchBuilder,
    payout,
  );

  return { batchBuilder, payout, settlements, mockProvider, pricing };
}

let taxIdCounter = 0;
async function seedMerchant(
  prisma: PrismaClient,
  opts: { bagFeeCentsOverride?: number | null } = {},
) {
  return prisma.merchant.create({
    data: {
      legalName: "Realdb Settlements Test Gida A.S.",
      tradeName: "Realdb Settlements Test Firin",
      taxId: `${SETTLEMENTS_TEST_TAG}-${Date.now()}-${taxIdCounter++}`,
      iban: "TR000006701000000000000002",
      verificationStatus: "APPROVED",
      bagFeeCentsOverride: opts.bagFeeCentsOverride ?? null,
    },
  });
}

async function seedStore(prisma: PrismaClient, merchantId: string) {
  return prisma.store.create({
    data: {
      merchantId,
      name: "Realdb Settlements Store",
      address: "Test Sk. No:3",
      district: "Kadikoy",
      city: "Istanbul",
      latitude: 40.99,
      longitude: 29.03,
    },
  });
}

async function seedBagTemplate(
  prisma: PrismaClient,
  storeId: string,
  priceCents: number,
) {
  return prisma.bagTemplate.create({
    data: {
      storeId,
      title: "Realdb Settlement Bag",
      category: "BAKERY",
      allergenDisclaimer: "N/A",
      originalValueCentsMin: 10000,
      originalValueCentsMax: 20000,
      priceCents,
    },
  });
}

async function seedOffer(
  prisma: PrismaClient,
  bagTemplateId: string,
  storeId: string,
  qtyTotal: number,
) {
  const pickupStartAt = new Date("2026-08-01T10:00:00.000Z");
  const pickupEndAt = new Date("2026-08-01T12:00:00.000Z");
  return prisma.dailyOffer.create({
    data: {
      bagTemplateId,
      storeId,
      offerDate: new Date("2026-08-01T00:00:00.000Z"),
      qtyTotal,
      pickupStartAt,
      pickupEndAt,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
}

let userCounter = 0;
let reservationCounter = 0;

async function seedRedeemedPaidReservation(
  prisma: PrismaClient,
  params: {
    storeId: string;
    offerId: string;
    qty: number;
    unitPriceCents: number;
    redeemedAt: Date;
  },
) {
  const n = userCounter++;
  const user = await prisma.user.create({
    data: { phoneE164: `+9055520${n.toString().padStart(6, "0")}` },
  });
  const rn = reservationCounter++;
  const totalCents = params.unitPriceCents * params.qty;
  const reservation = await prisma.reservation.create({
    data: {
      code: `${SETTLEMENTS_TEST_TAG}-R-${Date.now()}-${rn}`,
      userId: user.id,
      offerId: params.offerId,
      storeId: params.storeId,
      qty: params.qty,
      unitPriceCents: params.unitPriceCents,
      totalCents,
      status: "REDEEMED",
      cancelDeadlineAt: new Date(Date.now() + 3_600_000),
      redeemedAt: params.redeemedAt,
    },
  });
  const payment = await prisma.payment.create({
    data: {
      reservationId: reservation.id,
      provider: "MOCK",
      merchantOid: `${SETTLEMENTS_TEST_TAG}-OID-${Date.now()}-${rn}`,
      amountCents: totalCents,
      status: "PAID",
      idempotencyKey: `${SETTLEMENTS_TEST_TAG}-IDEMP-${Date.now()}-${rn}`,
      paidAt: new Date(),
    },
  });
  return { reservation, payment, totalCents, userId: user.id };
}

async function cleanupMerchant(prisma: PrismaClient, merchantId: string) {
  const batches = await prisma.settlementBatch.findMany({
    where: { merchantId },
    select: { id: true },
  });
  const batchIds = batches.map((b) => b.id);
  await prisma.commissionInvoice.deleteMany({ where: { merchantId } });
  await prisma.settlementLine.deleteMany({
    where: { batchId: { in: batchIds } },
  });
  await prisma.settlementBatch.deleteMany({ where: { merchantId } });
  await prisma.membershipSubscription.deleteMany({ where: { merchantId } });

  const stores = await prisma.store.findMany({
    where: { merchantId },
    select: { id: true },
  });
  const storeIds = stores.map((s) => s.id);
  const reservations = await prisma.reservation.findMany({
    where: { storeId: { in: storeIds } },
    select: { id: true, userId: true },
  });
  const reservationIds = reservations.map((r) => r.id);
  const userIds = Array.from(new Set(reservations.map((r) => r.userId)));
  const payments = await prisma.payment.findMany({
    where: { reservationId: { in: reservationIds } },
    select: { id: true },
  });
  const paymentIds = payments.map((p) => p.id);

  await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.deleteMany({
    where: { reservationId: { in: reservationIds } },
  });
  await prisma.reservation.deleteMany({
    where: { id: { in: reservationIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  const bagTemplates = await prisma.bagTemplate.findMany({
    where: { storeId: { in: storeIds } },
    select: { id: true },
  });
  const bagTemplateIds = bagTemplates.map((b) => b.id);
  await prisma.dailyOffer.deleteMany({
    where: { bagTemplateId: { in: bagTemplateIds } },
  });
  await prisma.bagTemplate.deleteMany({
    where: { id: { in: bagTemplateIds } },
  });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.merchant
    .delete({ where: { id: merchantId } })
    .catch(() => undefined);
}

d("Settlement engine — real DB concurrency + arithmetic proofs", () => {
  let prisma: PrismaClient;
  const merchantIds: string[] = [];
  const platformPricingIds: string[] = [];

  beforeAll(() => {
    const url = new URL(TEST_DATABASE_URL!);
    url.searchParams.set("connection_limit", "20");
    url.searchParams.set("pool_timeout", "30");
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const merchantId of merchantIds) {
      await safeCleanup(`merchant ${merchantId}`, () =>
        cleanupMerchant(prisma, merchantId),
      );
    }
    if (platformPricingIds.length > 0) {
      await safeCleanup("platformPricing", () =>
        prisma.platformPricing.deleteMany({
          where: { id: { in: platformPricingIds } },
        }),
      );
    }
    await prisma.$disconnect();
  });

  it("[a] two concurrent nightly runs over the SAME 10 eligible reservations: each lands in exactly one line, exactly one batch, exactly one payout", async () => {
    const { batchBuilder, payout, mockProvider } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma);
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 15000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 20);

    const redeemedAt = new Date("2026-08-01T11:00:00.000Z");
    const seeded = await Promise.all(
      Array.from({ length: 10 }, () =>
        seedRedeemedPaidReservation(prisma, {
          storeId: store.id,
          offerId: offer.id,
          qty: 1,
          unitPriceCents: 15000,
          redeemedAt,
        }),
      ),
    );
    const reservationIds = seeded.map((s) => s.reservation.id);
    const now = new Date("2026-08-02T02:00:00.000Z");

    const [resultA, resultB] = await Promise.all([
      batchBuilder.runNightlyCycle(now),
      batchBuilder.runNightlyCycle(now),
    ]);
    void resultA;
    void resultB;

    // Exactly one line per reservation — the core invariant, DB-enforced
    // by settlement_lines.reservationId's unique constraint, proven here
    // under genuine concurrency.
    const lines = await prisma.settlementLine.findMany({
      where: { reservationId: { in: reservationIds } },
    });
    expect(lines).toHaveLength(10);
    expect(new Set(lines.map((l) => l.reservationId)).size).toBe(10);

    // Exactly one CALCULATED batch for this merchant+day — the partial
    // unique index proving no split-batch outcome from the race.
    const batches = await prisma.settlementBatch.findMany({
      where: { merchantId: merchant.id },
    });
    expect(batches).toHaveLength(1);
    const batch = batches[0];

    // Hand-computed arithmetic: 10 x (gross 15000, bagFee 2500, vat 500,
    // withholding 150) = gross 150000, bagFee 25000, vat 5000,
    // withholding 1500, net 118500.
    expect(batch.grossCents).toBe(150000);
    expect(batch.bagFeeCents).toBe(25000);
    expect(batch.bagFeeVatCents).toBe(5000);
    expect(batch.withholdingCents).toBe(1500);
    expect(batch.netPayoutCents).toBe(118500);
    expect(batch.status).toBe("CALCULATED");

    // "No double payout": approve then execute payout TWICE concurrently
    // for this one batch — payout() is idempotent by ref (batch id), so
    // even a genuine race here must still record exactly one payout.
    await prisma.settlementBatch.updateMany({
      where: { id: batch.id, status: "CALCULATED" },
      data: { status: "APPROVED" },
    });
    await Promise.all([
      payout.executeOne(batch.id),
      payout.executeOne(batch.id),
    ]);

    const payoutsForBatch = mockProvider
      .getPayoutLog()
      .filter((p) => p.ref === batch.id);
    expect(payoutsForBatch).toHaveLength(1);
    expect(payoutsForBatch[0].amountCents).toBe(118500);

    const sentBatch = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(sentBatch.status).toBe("SENT");
  }, 30000);

  it("[b] a reservation refunded AFTER its line's batch was SENT ⇒ clawback lands on the NEXT batch, arithmetic exact", async () => {
    const { batchBuilder, payout, settlements } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma);
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 20000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    const day1 = new Date("2026-08-01T11:00:00.000Z");
    const { reservation, payment, totalCents } =
      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 20000,
        redeemedAt: day1,
      });

    const now1 = new Date("2026-08-02T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now1);
    const line = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    // Hand check: gross 20000, bagFee 2500, vat 500, withholding 200
    // (round(20000*0.01)) -> line "would-be net" = 20000-2500-500-200 = 16800.
    expect(line.grossCents).toBe(20000);
    expect(line.bagFeeCents).toBe(2500);
    expect(line.bagFeeVatCents).toBe(500);
    expect(line.withholdingCents).toBe(200);
    const expectedClawback = 20000 - 2500 - 500 - 200;
    expect(expectedClawback).toBe(16800);

    const batch1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    await settlements.adminApprove(batch1.id, now1);
    await payout.executeOne(batch1.id);
    const sentBatch1 = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch1.id },
    });
    expect(sentBatch1.status).toBe("SENT");
    expect(sentBatch1.netPayoutCents).toBe(16800);

    // The refund happens AFTER the batch was already sent.
    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        amountCents: totalCents,
        reason: "ADMIN",
        status: "DONE",
        requestedByType: "ADMIN",
        pspRefundId: `${SETTLEMENTS_TEST_TAG}-refund-${Date.now()}`,
      },
    });

    // A FRESH redemption the next day, for the SAME merchant — gives the
    // "next batch" real gross to absorb the clawback against, so
    // refundClawbackCents shows a nonzero applied figure rather than the
    // degenerate all-shortfall case (that no-gross-available branch is
    // already covered at the pure-math level by settlement-math.spec.ts's
    // "fixed fees exceed gross AND there is a live clawback demand" case).
    // gross 30000, bagFee 2500, vat 500, withholding 300 -> available
    // 26700, comfortably more than the 16800 clawback demand.
    const day2 = new Date("2026-08-03T11:00:00.000Z");
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 30000,
      redeemedAt: day2,
    });

    const now2 = new Date("2026-08-04T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now2);

    const clawedLine = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(clawedLine.clawbackAppliedAt).not.toBeNull();
    expect(clawedLine.clawbackBatchId).not.toBeNull();
    expect(clawedLine.clawbackBatchId).not.toBe(batch1.id);

    const batch2 = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: clawedLine.clawbackBatchId! },
    });
    expect(batch2.grossCents).toBe(30000);
    expect(batch2.bagFeeCents).toBe(2500);
    expect(batch2.bagFeeVatCents).toBe(500);
    expect(batch2.withholdingCents).toBe(300);
    expect(batch2.refundClawbackCents).toBe(expectedClawback);
    expect(batch2.netPayoutCents).toBe(
      30000 - 2500 - 500 - 300 - expectedClawback,
    );
    expect(batch2.netPayoutCents).toBe(9900);
    expect(batch2.status).toBe("CALCULATED"); // fully absorbed — NOT held
    expect(batch2.carriedShortfallCents).toBe(0);

    // batch1 itself is FROZEN — a later recompute attempt must be a no-op.
    const recomputedBatch1 = await batchBuilder.recomputeBatch(batch1.id, now2);
    expect(recomputedBatch1.netPayoutCents).toBe(16800);
    expect(recomputedBatch1.status).toBe("SENT");
  }, 30000);

  it("[c] payout provider failure ⇒ batch stays APPROVED, retried next tick, exactly one payout recorded on eventual success", async () => {
    const { batchBuilder, payout, settlements, mockProvider } =
      buildHarness(prisma);
    const merchant = await seedMerchant(prisma);
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 12000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 12000,
      redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
    });

    const now = new Date("2026-08-02T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now);
    const batch = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    await settlements.adminApprove(batch.id, now);

    mockProvider.forcePayoutFailure(batch.id);
    await payout.executeOne(batch.id);

    let current = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(current.status).toBe("APPROVED");
    expect(current.pspTransferRef).toBeNull();
    expect(
      mockProvider.getPayoutLog().filter((p) => p.ref === batch.id),
    ).toHaveLength(0);

    // "Next tick" — no forced failure this time.
    await payout.executeOne(batch.id);

    current = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(current.status).toBe("SENT");
    expect(current.pspTransferRef).not.toBeNull();
    const log = mockProvider.getPayoutLog().filter((p) => p.ref === batch.id);
    expect(log).toHaveLength(1);
  }, 30000);

  it("[d] membership fully recovered across 3 batches ⇒ offsets sum exactly to the price, 4th batch offsets 0", async () => {
    const { batchBuilder } = buildHarness(prisma);
    // bagFeeCentsOverride: 0 — isolates the membership-offset arithmetic
    // from the bag-fee/VAT deduction, per this test's own hand-computed
    // numbers (see the file's own report for the full derivation): with
    // grossCents=101 and 0 bag fee, withholding = round(101*0.01) = 1,
    // leaving exactly 100 kuruş "available" per line for the offset to
    // draw from — engineered so 3 batches of 100 each exactly recover a
    // 300-kuruş membership price, and a 4th offsets 0.
    const merchant = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 101);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    const subscription = await prisma.membershipSubscription.create({
      data: {
        merchantId: merchant.id,
        anchorDate: new Date("2026-01-01T00:00:00.000Z"),
        currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
        priceCents: 300,
        status: "TRIAL",
        outstandingCents: 300,
      },
    });

    const days = [
      "2026-08-01T11:00:00.000Z",
      "2026-08-02T11:00:00.000Z",
      "2026-08-03T11:00:00.000Z",
      "2026-08-04T11:00:00.000Z",
    ];
    for (const day of days) {
      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 101,
        redeemedAt: new Date(day),
      });
    }

    const now = new Date("2026-08-05T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now);

    const batches = await prisma.settlementBatch.findMany({
      where: { merchantId: merchant.id },
      orderBy: { periodStart: "asc" },
    });
    expect(batches).toHaveLength(4);
    expect(batches.map((b) => b.membershipOffsetCents)).toEqual([
      100, 100, 100, 0,
    ]);
    const sumOffsets = batches.reduce((s, b) => s + b.membershipOffsetCents, 0);
    expect(sumOffsets).toBe(300);

    const finalSub = await prisma.membershipSubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(finalSub.outstandingCents).toBe(0);
    expect(finalSub.periodPaidAt).not.toBeNull();
    expect(finalSub.status).toBe("ACTIVE"); // TRIAL -> ACTIVE on first real offset

    // Each net payout = gross(101) - bagFee(0) - vat(0) - withholding(1) - offset.
    expect(batches[0].netPayoutCents).toBe(0); // 100 available, all 100 offset
    expect(batches[3].netPayoutCents).toBe(100); // nothing left to offset
  }, 30000);

  it("[e] a price change mid-life leaves an already-computed batch unchanged; a new batch uses the new price", async () => {
    const { batchBuilder } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma);
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 10000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    // Day BEFORE the price change — resolves the seed migration's
    // default pricing (2500/199000, effectiveFrom 2026-01-01).
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 10000,
      redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
    });

    // Insert the price change directly (bypassing scheduleFuturePricing's
    // real-wall-clock future-only guard — see pricing.service.spec.ts for
    // that validation's own unit coverage; NO wall-clock sleep here, per
    // the brief's realdb discipline) with an effectiveFrom strictly
    // between the two reservations' redemption days.
    const newPricing = await prisma.platformPricing.create({
      data: {
        bagFeeCents: 3000,
        membershipAnnualCents: 250000,
        effectiveFrom: new Date("2026-08-03T00:00:00.000Z"),
      },
    });
    platformPricingIds.push(newPricing.id);

    // Day AFTER the price change.
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 10000,
      redeemedAt: new Date("2026-08-05T11:00:00.000Z"),
    });

    const now = new Date("2026-08-06T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now);

    const batches = await prisma.settlementBatch.findMany({
      where: { merchantId: merchant.id },
      orderBy: { periodStart: "asc" },
    });
    expect(batches).toHaveLength(2);
    const [oldBatch, newBatch] = batches;
    expect(oldBatch.bagFeeCents).toBe(2500); // old default price
    expect(newBatch.bagFeeCents).toBe(3000); // new price

    // Recompute the OLD batch again, AFTER the price change — must stay
    // identical (price is resolved as-of ITS OWN period date, not "now").
    const recomputedOld = await batchBuilder.recomputeBatch(oldBatch.id, now);
    expect(recomputedOld.bagFeeCents).toBe(2500);
    expect(recomputedOld.bagFeeVatCents).toBe(500);
  }, 30000);
});
