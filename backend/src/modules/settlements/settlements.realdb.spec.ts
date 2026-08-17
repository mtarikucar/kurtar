import { ConflictException } from "@nestjs/common";
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
  // SettlementPayoutService.sendBatch publishes two outbox rows per batch
  // (settlement.batch.sent.v1 + settlement.batch.sent.invoice.v1, keyed off
  // the batch id) that nothing in this suite ever drains — left uncleaned,
  // they sit QUEUED and get swept into outbox-worker.realdb.spec.ts's
  // platform-wide claim (that file's own doc comment already establishes
  // why: claimBatch is intentionally NOT type-scoped, so a shared DB's
  // undrained debris crowds its bounded-batch LIMIT).
  await prisma.outboxEvent.deleteMany({
    where: {
      type: {
        in: ["settlement.batch.sent.v1", "settlement.batch.sent.invoice.v1"],
      },
      idempotencyKey: {
        in: batchIds.flatMap((id) => [
          `settlement-batch-sent:${id}`,
          `settlement-batch-sent-invoice:${id}`,
        ]),
      },
    },
  });
  await prisma.settlementCarriedDemandClaim.deleteMany({
    where: { claimantBatchId: { in: batchIds } },
  });
  await prisma.settlementClawbackAllocation.deleteMany({
    where: { batchId: { in: batchIds } },
  });
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

/**
 * [Fix round #4] The two ledger invariants, asserted straight off the
 * database. Every clawback scenario below ends with a call to this — an
 * assertion about the SHAPE of the stored state rather than about the
 * particular numbers one scenario happens to produce, which is what the
 * previous four rounds' example-shaped assertions kept missing by one
 * branch.
 *
 *  (1) For every batch: refundClawbackCents === externalAbsorbed +
 *      SUM(its allocation rows). The batch ledger and the line ledger
 *      cannot drift apart.
 *  (2) For every line: clawbackCents === SUM(its allocation rows), and
 *      clawbackAppliedAt is non-null EXACTLY when that sum covers the
 *      line's full demand — so an under-recovered line is always still
 *      visible to the recovery queries, and no kuruş is owed by nobody.
 */
async function expectClawbackLedgerConsistent(
  prisma: PrismaClient,
  merchantId: string,
) {
  const batches = await prisma.settlementBatch.findMany({
    where: { merchantId },
    select: {
      id: true,
      refundClawbackCents: true,
      inheritedExternalDemandCents: true,
      carriedExternalDemandCents: true,
    },
  });
  const batchIds = batches.map((b) => b.id);
  const allocations = await prisma.settlementClawbackAllocation.findMany({
    where: { batchId: { in: batchIds } },
  });

  // [Fix round #5] The carried-demand (external) half of the same
  // identity: inheritedExternalDemandCents is a PROJECTION of the batch's
  // claim row, so comparing the two is a real cross-representation check
  // — not a round-trip of one in-memory variable.
  const claims = await prisma.settlementCarriedDemandClaim.findMany({
    where: { claimantBatchId: { in: batchIds } },
  });
  for (const batch of batches) {
    const claim = claims.find((c) => c.claimantBatchId === batch.id);
    expect({
      batchId: batch.id,
      inherited: batch.inheritedExternalDemandCents,
    }).toEqual({ batchId: batch.id, inherited: claim?.amountCents ?? 0 });
    expect(batch.carriedExternalDemandCents).toBeGreaterThanOrEqual(0);
    expect(batch.carriedExternalDemandCents).toBeLessThanOrEqual(
      batch.inheritedExternalDemandCents,
    );
  }
  expect(claims.every((c) => c.amountCents > 0)).toBe(true);

  for (const batch of batches) {
    const mine = allocations
      .filter((a) => a.batchId === batch.id)
      .reduce((s, a) => s + a.amountCents, 0);
    const externalAbsorbed =
      batch.inheritedExternalDemandCents - batch.carriedExternalDemandCents;
    expect({
      batchId: batch.id,
      recorded: batch.refundClawbackCents,
    }).toEqual({
      batchId: batch.id,
      recorded: externalAbsorbed + mine,
    });
    expect(mine).toBeGreaterThanOrEqual(0);
    expect(allocations.every((a) => a.amountCents > 0)).toBe(true);
  }

  const lines = await prisma.settlementLine.findMany({
    where: { batchId: { in: batchIds } },
  });
  for (const line of lines) {
    const total = allocations
      .filter((a) => a.reservationId === line.reservationId)
      .reduce((s, a) => s + a.amountCents, 0);
    const fullDemand = Math.max(
      0,
      line.grossCents -
        line.bagFeeCents -
        line.bagFeeVatCents -
        line.withholdingCents,
    );
    expect({
      reservationId: line.reservationId,
      clawbackCents: line.clawbackCents,
      resolved: line.clawbackAppliedAt !== null,
    }).toEqual({
      reservationId: line.reservationId,
      clawbackCents: total,
      resolved: fullDemand > 0 && total >= fullDemand,
    });
    expect(total).toBeLessThanOrEqual(fullDemand);
  }
}

/** The money fields a recompute is allowed to derive — everything an
 * idempotence check must find byte-identical across repeat passes. */
function moneySnapshot(batch: {
  grossCents: number;
  bagFeeCents: number;
  bagFeeVatCents: number;
  withholdingCents: number;
  membershipOffsetCents: number;
  membershipOffsetVatCents: number;
  refundClawbackCents: number;
  netPayoutCents: number;
  carriedShortfallCents: number;
  carriedExternalDemandCents: number;
  inheritedExternalDemandCents: number;
  status: string;
}) {
  return {
    grossCents: batch.grossCents,
    bagFeeCents: batch.bagFeeCents,
    bagFeeVatCents: batch.bagFeeVatCents,
    withholdingCents: batch.withholdingCents,
    membershipOffsetCents: batch.membershipOffsetCents,
    membershipOffsetVatCents: batch.membershipOffsetVatCents,
    refundClawbackCents: batch.refundClawbackCents,
    netPayoutCents: batch.netPayoutCents,
    carriedShortfallCents: batch.carriedShortfallCents,
    carriedExternalDemandCents: batch.carriedExternalDemandCents,
    inheritedExternalDemandCents: batch.inheritedExternalDemandCents,
    status: batch.status,
  };
}

/** Every stored fact about a merchant's clawback ledger — batch money
 * rows, line clawback columns, allocation rows. What "recompute is
 * idempotent" actually has to mean. */
async function ledgerSnapshot(prisma: PrismaClient, merchantId: string) {
  const batches = await prisma.settlementBatch.findMany({
    where: { merchantId },
    orderBy: { id: "asc" },
  });
  const batchIds = batches.map((b) => b.id);
  const lines = await prisma.settlementLine.findMany({
    where: { batchId: { in: batchIds } },
    orderBy: { reservationId: "asc" },
    select: {
      reservationId: true,
      clawbackCents: true,
      clawbackBatchId: true,
      clawbackAppliedAt: true,
      bagFeeCents: true,
      bagFeeVatCents: true,
      withholdingCents: true,
    },
  });
  const allocations = await prisma.settlementClawbackAllocation.findMany({
    where: { batchId: { in: batchIds } },
    orderBy: [{ batchId: "asc" }, { reservationId: "asc" }],
    select: { batchId: true, reservationId: true, amountCents: true },
  });
  const claims = await prisma.settlementCarriedDemandClaim.findMany({
    where: { claimantBatchId: { in: batchIds } },
    orderBy: [{ claimantBatchId: "asc" }],
    select: { claimantBatchId: true, sourceBatchId: true, amountCents: true },
  });
  return {
    batches: batches.map((b) => ({
      id: b.id,
      ...moneySnapshot(b),
      carriedDemandSourceBatchId: b.carriedDemandSourceBatchId,
    })),
    lines,
    allocations,
    claims,
  };
}

d("Settlement engine — real DB concurrency + arithmetic proofs", () => {
  let prisma: PrismaClient;
  const merchantIds: string[] = [];

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
    // [Fix round, I10] platform_pricing has no per-test tracking array
    // anymore — the one test that seeds a row (test [e]) deletes it
    // itself, inline, in a `finally`, immediately after use.
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

    // Exactly one CALCULATED batch for this merchant+day — the advisory
    // lock proving no split-batch outcome from the race (settlement-batch-
    // builder.service.ts's createOrExtendBatch — a Postgres transaction-
    // scoped pg_advisory_xact_lock, not a partial unique index; Prisma
    // cannot express the latter without a second permanent divergence
    // from schema.prisma on top of the one already accepted for
    // stores.location's GIST index).
    const batches = await prisma.settlementBatch.findMany({
      where: { merchantId: merchant.id },
    });
    expect(batches).toHaveLength(1);
    const batch = batches[0];

    // Hand-computed arithmetic (per-line): gross 15000, bagFee 2500, vat
    // 500, withholding base = 15000-2500-500 = 12000 -> withholding =
    // round(12000/100) = 120 (P3: withholding is on the merchant's
    // EARNING — gross minus the platform's own fee+VAT — not raw gross).
    // x10 lines: gross 150000, bagFee 25000, vat 5000, withholding 1200,
    // net 150000-25000-5000-1200 = 118800.
    expect(batch.grossCents).toBe(150000);
    expect(batch.bagFeeCents).toBe(25000);
    expect(batch.bagFeeVatCents).toBe(5000);
    expect(batch.withholdingCents).toBe(1200);
    expect(batch.netPayoutCents).toBe(118800);
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
    expect(payoutsForBatch[0].amountCents).toBe(118800);

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
    // Hand check (P3 withholding base = gross - bagFee - bagFeeVat =
    // 20000-2500-500 = 17000 -> withholding = round(17000/100) = 170) ->
    // line "would-be net" = 20000-2500-500-170 = 16830.
    expect(line.grossCents).toBe(20000);
    expect(line.bagFeeCents).toBe(2500);
    expect(line.bagFeeVatCents).toBe(500);
    expect(line.withholdingCents).toBe(170);
    const expectedClawback = 20000 - 2500 - 500 - 170;
    expect(expectedClawback).toBe(16830);

    const batch1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    await settlements.adminApprove(batch1.id, now1);
    await payout.executeOne(batch1.id);
    const sentBatch1 = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch1.id },
    });
    expect(sentBatch1.status).toBe("SENT");
    expect(sentBatch1.netPayoutCents).toBe(16830);

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
    // gross 30000, bagFee 2500, vat 500, withholding base 27000 ->
    // withholding 270 -> available 26730, comfortably more than the
    // 16830 clawback demand.
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
    expect(batch2.withholdingCents).toBe(270);
    expect(batch2.refundClawbackCents).toBe(expectedClawback);
    expect(batch2.netPayoutCents).toBe(
      30000 - 2500 - 500 - 270 - expectedClawback,
    );
    expect(batch2.netPayoutCents).toBe(9900);
    expect(batch2.status).toBe("CALCULATED"); // fully absorbed — NOT held
    expect(batch2.carriedShortfallCents).toBe(0);

    // [I4] The clawed-back line's clawbackCents is the ACTUAL amount
    // absorbed (its full would-be-net demand, fully recovered in one shot
    // here since batch2 had enough gross), not just a write-once marker
    // with no amount behind it.
    expect(clawedLine.clawbackCents).toBe(expectedClawback);

    // batch1 itself is FROZEN — a later recompute attempt must be a no-op.
    const recomputedBatch1 = await batchBuilder.recomputeBatch(batch1.id, now2);
    expect(recomputedBatch1.netPayoutCents).toBe(16830);
    expect(recomputedBatch1.status).toBe("SENT");

    // [Fix round #2, C2-residual — the exact scenario the re-review named]
    // batch2 is CALCULATED, its clawback already fully applied to the
    // line (clawbackAppliedAt set). The operator's very next action here
    // is adminApprove, which recomputes ONCE MORE before locking in
    // (settlements.service.ts). Before fix round #2, the candidate query
    // excluded the already-applied line entirely, so this recompute would
    // silently rederive refundClawbackCents=0 and pay out the FULL,
    // un-clawed-back 26730 instead of 9900 — forgiving the whole 16830.
    // Must now be a true no-op: identical numbers, twice over (approve's
    // own internal recompute, then a second explicit recompute) proving
    // stability, not a one-time coincidence.
    const approvedBatch2 = await settlements.adminApprove(batch2.id, now2);
    expect(approvedBatch2.refundClawbackCents).toBe(expectedClawback);
    expect(approvedBatch2.netPayoutCents).toBe(9900);
    expect(approvedBatch2.status).toBe("APPROVED");

    const reRecomputedBatch2 = await batchBuilder.recomputeBatch(
      batch2.id,
      now2,
    );
    expect(reRecomputedBatch2.refundClawbackCents).toBe(expectedClawback);
    expect(reRecomputedBatch2.netPayoutCents).toBe(9900);

    const lineAfterApprove = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(lineAfterApprove.clawbackCents).toBe(expectedClawback); // unchanged
    expect(lineAfterApprove.clawbackAppliedAt).not.toBeNull();
    expect(lineAfterApprove.clawbackBatchId).toBe(batch2.id);
    // Total ever withheld from this line === its total demand — nothing
    // forgiven, nothing double-counted, across the whole chain.
    expect(lineAfterApprove.clawbackCents).toBe(
      lineAfterApprove.grossCents -
        lineAfterApprove.bagFeeCents -
        lineAfterApprove.bagFeeVatCents -
        lineAfterApprove.withholdingCents,
    );

    // Close the loop: payout must actually send the correct, still-clawed-
    // back amount — proving the fix end to end, not just at the batch-row
    // level.
    const sentBatch2 = await payout.executeOne(batch2.id);
    expect(sentBatch2.status).toBe("SENT");
    expect(sentBatch2.netPayoutCents).toBe(9900);
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

    // [Fix round, I10] Insert the price change directly (bypassing
    // scheduleFuturePricing's real-wall-clock future-only guard — see
    // pricing.service.spec.ts for that validation's own unit coverage; NO
    // wall-clock sleep here, per the brief's realdb discipline) with an
    // effectiveFrom strictly between the two reservations' redemption
    // days. `platform_pricing` has NO merchant scoping (it's a genuinely
    // global table by design — every other realdb spec file's price
    // resolution depends on the SAME seed-migration default), so this row
    // is deleted in a `finally` IMMEDIATELY after this one test uses it —
    // never deferred to this file's shared `afterAll` — to keep its
    // window of existence as narrow as possible against any OTHER spec
    // file that might run concurrently and seed a redemption dated on or
    // after 2026-08-03 without a per-merchant override.
    const newPricing = await prisma.platformPricing.create({
      data: {
        bagFeeCents: 3000,
        membershipAnnualCents: 250000,
        effectiveFrom: new Date("2026-08-03T00:00:00.000Z"),
      },
    });
    try {
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
    } finally {
      await prisma.platformPricing.delete({ where: { id: newPricing.id } });
    }
  }, 30000);

  it("[f] [C2/I5] a HELD batch's shortfall survives a no-op admin retry unchanged, then resolves once new gross arrives — two-batch chain, own-fee-deficit inheritance", async () => {
    const { batchBuilder, settlements } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma);
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 1000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    // batch1 (day1): one tiny reservation whose fixed fees alone exceed its
    // gross — gross 1000, bagFee 2500, vat 500 -> avail1 = 1000-2500-500 =
    // -2000, all of it an OWN fee deficit (no clawback involved at all).
    // HELD with carriedShortfallCents = 2000.
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 1000,
      redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
    });
    const now1 = new Date("2026-08-02T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now1);
    const batch1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    expect(batch1.status).toBe("HELD");
    expect(batch1.carriedShortfallCents).toBe(2000);
    expect(batch1.carriedExternalDemandCents).toBe(0); // originating link — nothing inherited

    // batch2 (day2): ANOTHER tiny reservation, same fee-deficit shape, on
    // its OWN day -> its own recompute inherits batch1's OWN fee deficit
    // (2000, batch1.carriedExternalDemandCents=0 contributes nothing) as
    // `carriedFromPrior`, on top of its OWN identical 2000 deficit.
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 1000,
      redeemedAt: new Date("2026-08-02T11:00:00.000Z"),
    });
    const now2 = new Date("2026-08-03T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now2);
    const batch2 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id, id: { not: batch1.id } },
    });
    expect(batch2.status).toBe("HELD");
    expect(batch2.grossCents).toBe(1000);
    expect(batch2.netPayoutCents).toBe(0);
    expect(batch2.carriedShortfallCents).toBe(4000); // own 2000 + inherited 2000
    expect(batch2.carriedExternalDemandCents).toBe(2000); // the inherited portion, tracked separately

    // [C2] Admin retries the HELD batch2 with NO new lines — the documented
    // purpose of the retry endpoint. Before this fix round, resolveCarried-
    // Shortfall excluded the batch being recomputed from its own-predecessor
    // lookup, so this call would find NOTHING to inherit and silently
    // resolve batch2's shortfall to 0 (money forgiven). It must instead
    // reproduce EXACTLY pass 1's numbers — stable, not growing and not
    // vanishing.
    await settlements.adminRetry(batch2.id, now2);
    const batch2Retried = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch2.id },
    });
    expect(batch2Retried.status).toBe("HELD");
    expect(batch2Retried.carriedShortfallCents).toBe(4000);
    expect(batch2Retried.carriedExternalDemandCents).toBe(2000);
    expect(batch2Retried.netPayoutCents).toBe(0);

    // A second no-op retry must ALSO reproduce the same numbers — proving
    // convergence, not just a one-time coincidence (the original bug this
    // fix replaced would have grown 2000 -> 4000 -> 6000 -> ... on every
    // successive retry).
    await settlements.adminRetry(batch2.id, now2);
    const batch2RetriedTwice = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch2.id },
    });
    expect(batch2RetriedTwice.carriedShortfallCents).toBe(4000);

    // Extend batch2 (same day) with a big reservation whose gross comfortably
    // covers both the batch's own fees AND the carried 2000 -> resolves.
    // gross 10000, bagFee 2500, vat 500, withholding base 7000 -> withholding
    // 70; combined with the tiny line (gross 1000, bagFee 2500, vat 500,
    // withholding 0): total gross 11000, bagFee 5000, vat 1000, withholding
    // 70, avail 4930; carried 2000 fully absorbed -> net 4930-2000 = 2930.
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 10000,
      redeemedAt: new Date("2026-08-02T13:00:00.000Z"),
    });
    const now3 = new Date("2026-08-04T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now3);
    const batch2Resolved = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch2.id },
    });
    expect(batch2Resolved.grossCents).toBe(11000);
    expect(batch2Resolved.bagFeeCents).toBe(5000);
    expect(batch2Resolved.bagFeeVatCents).toBe(1000);
    expect(batch2Resolved.withholdingCents).toBe(70);
    expect(batch2Resolved.refundClawbackCents).toBe(2000);
    expect(batch2Resolved.netPayoutCents).toBe(2930);
    expect(batch2Resolved.carriedShortfallCents).toBe(0);
    expect(batch2Resolved.carriedExternalDemandCents).toBe(0);
    expect(batch2Resolved.status).toBe("CALCULATED"); // resolved — no longer HELD

    // [Fix round #3, C2-residual — CRITICAL, the exact scenario the
    // re-review named] batch2 just FULLY absorbed its inherited 2000
    // (carriedExternalDemandCents, the RESIDUAL, correctly dropped to 0 —
    // nothing left for a future batch to inherit). The operator's very
    // next, completely ordinary action here is adminApprove, which
    // recomputes ONCE MORE before locking in (settlements.service.ts:97).
    // Before this fix, that recompute read the now-zero RESIDUAL as its
    // OWN starting point (carriedFromPrior), rederived refundClawbackCents
    // down to 0, and paid the full 2000 back out — avail 4930 instead of
    // the correct 2930 — forgiving money already, correctly, recovered.
    // Unlike the line-level version of C2, this 2000 would then be
    // GENUINELY UNRECOVERABLE: resolveCarriedShortfall only ever inherits
    // from a HELD most-recent predecessor, and batch2 is APPROVED by the
    // time anything else could look at it again. Must be a true no-op.
    const approvedBatch2 = await settlements.adminApprove(batch2.id, now3);
    expect(approvedBatch2.refundClawbackCents).toBe(2000);
    expect(approvedBatch2.netPayoutCents).toBe(2930);
    expect(approvedBatch2.carriedExternalDemandCents).toBe(0); // residual — nothing left to inherit
    expect(approvedBatch2.status).toBe("APPROVED");

    // The inherited demand is still fully accounted for — no line-level
    // clawback is involved in this scenario at all (the inherited 2000 is
    // a pure cross-batch fee-deficit carry, never line-attributable), so
    // "still accounted for" is exactly refundClawbackCents/netPayoutCents
    // staying at 2000/2930 above, and confirmed via the SENT batch's own
    // recorded amount at the very end of this test.

    // A second, direct no-op recompute must ALSO reproduce the same
    // numbers — APPROVED is a frozen status (RECOMPUTABLE_SETTLEMENT_
    // STATUSES excludes it), so this proves the amount is genuinely
    // locked in, not merely stable by coincidence of a single call.
    const reRecomputedApproved = await batchBuilder.recomputeBatch(
      batch2.id,
      now3,
    );
    expect(reRecomputedApproved.refundClawbackCents).toBe(2000);
    expect(reRecomputedApproved.netPayoutCents).toBe(2930);
    expect(reRecomputedApproved.status).toBe("APPROVED"); // untouched — frozen

    // Close the loop: adminRetry's APPROVED path (payout.executeOne) must
    // actually send the correct, still-accounted-for amount — proving the
    // fix end to end, not just at the batch-row level.
    await settlements.adminRetry(batch2.id, now3);
    const sentBatch2 = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch2.id },
    });
    expect(sentBatch2.status).toBe("SENT");
    expect(sentBatch2.netPayoutCents).toBe(2930);
  }, 30000);

  it("[g] [I4] a HELD batch partially absorbs TWO refunded lines (one fully, one partially) — FIFO order, cumulative clawbackCents, and the remainder is picked up by a THIRD batch without double-counting the second batch's own resolved shortfall", async () => {
    const { batchBuilder, payout, settlements } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma);
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 15000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    const day1 = new Date("2026-08-01T11:00:00.000Z");
    const first = await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 15000,
      redeemedAt: new Date(day1.getTime()), // earlier -> FIFO priority
    });
    const second = await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 15000,
      redeemedAt: new Date(day1.getTime() + 60 * 60 * 1000),
    });

    const now1 = new Date("2026-08-02T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now1);
    const batch1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    // Each line: gross 15000, bagFee 2500, vat 500, withholding base 12000
    // -> withholding 120, would-be-net demand = 15000-2500-500-120 = 11880.
    const perLineDemand = 11880;
    expect(batch1.grossCents).toBe(30000);
    expect(batch1.netPayoutCents).toBe(perLineDemand * 2);
    expect(batch1.status).toBe("CALCULATED");
    await settlements.adminApprove(batch1.id, now1);
    await payout.executeOne(batch1.id);

    // Both reservations refunded AFTER the batch was sent.
    for (const seeded of [first, second]) {
      await prisma.refund.create({
        data: {
          paymentId: seeded.payment.id,
          amountCents: seeded.totalCents,
          reason: "ADMIN",
          status: "DONE",
          requestedByType: "ADMIN",
          pspRefundId: `${SETTLEMENTS_TEST_TAG}-refund-${Date.now()}-${Math.random()}`,
        },
      });
    }

    // batch2: fresh gross 20000, only enough to PARTIALLY cover the combined
    // 23760 demand. bagFee 2500, vat 500, withholding base 17000 ->
    // withholding 170, available 16830 -> refundClawback = min(23760,16830)
    // = 16830 (partial), net = 0, shortfall = 23760-16830 = 6930 -> HELD.
    const day2 = new Date("2026-08-03T11:00:00.000Z");
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 20000,
      redeemedAt: day2,
    });
    const now2 = new Date("2026-08-04T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now2);

    const batch2 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id, id: { not: batch1.id } },
    });
    expect(batch2.grossCents).toBe(20000);
    expect(batch2.bagFeeCents).toBe(2500);
    expect(batch2.bagFeeVatCents).toBe(500);
    expect(batch2.withholdingCents).toBe(170);
    expect(batch2.refundClawbackCents).toBe(16830);
    expect(batch2.netPayoutCents).toBe(0);
    expect(batch2.status).toBe("HELD");
    expect(batch2.carriedShortfallCents).toBe(6930);
    // batch2's OWN fee deficit is 0 (its gross covered its own fees fine —
    // the shortfall here is 100% unmet CLAWBACK demand, not a fee deficit),
    // so nothing beyond this batch's own clawback tracking should ever be
    // inherited cross-batch for it.
    expect(batch2.carriedExternalDemandCents).toBe(0);

    // [I4] line1 (earlier redeemedAt, FIFO priority) is FULLY resolved;
    // line2 is only PARTIALLY resolved and stays eligible for the next
    // sweep — neither is marked fully applied when only partially absorbed.
    const line1 = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: first.reservation.id },
    });
    const line2 = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: second.reservation.id },
    });
    expect(line1.clawbackCents).toBe(perLineDemand);
    expect(line1.clawbackAppliedAt).not.toBeNull();
    expect(line1.clawbackBatchId).toBe(batch2.id);
    expect(line2.clawbackCents).toBe(16830 - perLineDemand);
    expect(line2.clawbackAppliedAt).toBeNull();
    expect(line2.clawbackBatchId).toBe(batch2.id);

    // [Fix round #2, C2-residual — the exact "partial variant" the
    // re-review named] batch2 is HELD. The operator's natural next action
    // on a HELD batch is adminRetry, which recomputes. Before this fix,
    // line1 (already fully applied) would drop out of the candidate query
    // entirely, so this retry would rederive refundClawbackCents from
    // ONLY line2's still-open remainder (6930 demand, but recomputed as
    // if nothing had ever been recovered) instead of the true combined
    // 16830 — net would flip from 0 to 9900 (paying out money already
    // clawed back) while line1's books still assert full recovery. Must
    // be a true no-op: identical numbers, and line1/line2's cumulative
    // amounts unchanged.
    const retriedBatch2 = await settlements.adminRetry(batch2.id, now2);
    expect(retriedBatch2.status).toBe("HELD");
    expect(retriedBatch2.refundClawbackCents).toBe(16830);
    expect(retriedBatch2.netPayoutCents).toBe(0);
    expect(retriedBatch2.carriedShortfallCents).toBe(6930);

    const line1AfterRetry = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: first.reservation.id },
    });
    const line2AfterRetry = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: second.reservation.id },
    });
    expect(line1AfterRetry.clawbackCents).toBe(perLineDemand); // unchanged
    expect(line1AfterRetry.clawbackAppliedAt).not.toBeNull();
    expect(line2AfterRetry.clawbackCents).toBe(16830 - perLineDemand); // unchanged
    expect(line2AfterRetry.clawbackAppliedAt).toBeNull();

    // A second no-op retry must ALSO reproduce the same numbers.
    await settlements.adminRetry(batch2.id, now2);
    const batch2AfterSecondRetry =
      await prisma.settlementBatch.findUniqueOrThrow({
        where: { id: batch2.id },
      });
    expect(batch2AfterSecondRetry.refundClawbackCents).toBe(16830);
    expect(batch2AfterSecondRetry.netPayoutCents).toBe(0);

    // batch3: another fresh gross 20000 on a NEW day -> re-discovers line2's
    // REMAINING demand (perLineDemand - 4950 = 6930) directly via
    // the candidate query (it belongs to batch1, which is SENT) — this must
    // NOT ALSO be fed in via resolveCarriedShortfall inheriting batch2's
    // carriedShortfallCents (6930), which would double it to 13860. Same
    // arithmetic as batch2: bagFee 2500, vat 500, withholding 170, available
    // 16830 -> comfortably resolves the remaining 6930 in full.
    const day3 = new Date("2026-08-05T11:00:00.000Z");
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 20000,
      redeemedAt: day3,
    });
    const now3 = new Date("2026-08-06T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now3);

    const batch3 = await prisma.settlementBatch.findFirstOrThrow({
      where: {
        merchantId: merchant.id,
        id: { notIn: [batch1.id, batch2.id] },
      },
    });
    const line2RemainingAfterBatch2 = perLineDemand - (16830 - perLineDemand); // 6930
    expect(batch3.refundClawbackCents).toBe(line2RemainingAfterBatch2); // 6930, NOT 13860
    expect(batch3.netPayoutCents).toBe(16830 - line2RemainingAfterBatch2); // 9900
    expect(batch3.status).toBe("CALCULATED");
    expect(batch3.carriedShortfallCents).toBe(0);

    const line2Resolved = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: second.reservation.id },
    });
    expect(line2Resolved.clawbackCents).toBe(perLineDemand); // now fully caught up
    expect(line2Resolved.clawbackAppliedAt).not.toBeNull();
    expect(line2Resolved.clawbackBatchId).toBe(batch3.id);

    // batch2 itself is untouched by batch3's resolution — its own
    // carriedShortfallCents is a historical record of what IT could not
    // cover, not a live balance that batch3 pays down directly.
    const batch2After = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch2.id },
    });
    expect(batch2After.carriedShortfallCents).toBe(6930);

    // Total ever withheld across BOTH lines, across the whole 3-batch
    // chain, equals their combined total demand exactly — nothing
    // forgiven (the C2-residual bug), nothing double-counted (the
    // original C2 bug this test file's [f]/[g] already guard).
    const line1Final = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: first.reservation.id },
    });
    const totalWithheld =
      line1Final.clawbackCents + line2Resolved.clawbackCents;
    const totalDemand = perLineDemand * 2;
    expect(totalWithheld).toBe(totalDemand);
    expect(totalWithheld).toBe(23760);
  }, 30000);

  it("[h] [I12] a reservation refunded WHILE its batch is still CALCULATED (not yet approved) is still paid out in full at send time — recomputeBatch re-derives from settlement_lines, not payment/refund status — and clawed back on a later batch", async () => {
    const { batchBuilder, payout, settlements } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma);
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 15000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    const { reservation, payment, totalCents } =
      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 15000,
        redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
      });

    const now1 = new Date("2026-08-02T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now1);
    const batch1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    expect(batch1.status).toBe("CALCULATED");
    expect(batch1.netPayoutCents).toBe(11880);

    // The refund lands WHILE batch1 is still CALCULATED — before any
    // approve/send. The report accompanying the original ship claimed this
    // couldn't happen because the eligibility query only selects payment.
    // status = PAID reservations; that reasoning was wrong (settlementLine
    // eligibility is decided ONCE, at line-creation time — a refund after
    // that never un-creates the line, and recomputeBatch re-derives strictly
    // from settlement_lines, never re-checking payment/refund status).
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

    // adminApprove recomputes ONCE MORE before locking in — and the result
    // is UNCHANGED: the refund has no effect on a batch that already has
    // the line, because recomputeBatch never looks at refunds directly, only
    // at unresolved-clawback lines belonging to OTHER, already-SENT batches.
    const approved = await settlements.adminApprove(batch1.id, now1);
    expect(approved.netPayoutCents).toBe(11880);
    expect(approved.status).toBe("APPROVED");

    await payout.executeOne(batch1.id);
    const sentBatch1 = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch1.id },
    });
    expect(sentBatch1.status).toBe("SENT");
    expect(sentBatch1.netPayoutCents).toBe(11880); // paid in FULL despite the pre-send refund

    // Only once batch1 reaches SENT does the candidate query see the line at
    // all — a later batch is what actually recovers it.
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
    expect(clawedLine.clawbackCents).toBe(11880);

    const batch2 = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: clawedLine.clawbackBatchId! },
    });
    // gross 30000, bagFee 2500, vat 500, withholding base 27000 ->
    // withholding 270, available 26730, clawback 11880 -> net 14850.
    expect(batch2.refundClawbackCents).toBe(11880);
    expect(batch2.netPayoutCents).toBe(14850);
  }, 30000);

  it("[i] [C3] once a payout has been attempted, adminHold is refused with a specific error code — the batch's amount is frozen, not silently re-openable — and a later successful retry still completes normally", async () => {
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

    // Force the FIRST payout attempt to fail at the provider — executeOne
    // stamps payoutAttemptedAt BEFORE calling the provider, so the batch
    // stays APPROVED but is now sentinel-marked, even though no transfer
    // ever actually completed.
    mockProvider.forcePayoutFailure(batch.id);
    await payout.executeOne(batch.id);

    const afterFailedAttempt = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(afterFailedAttempt.status).toBe("APPROVED");
    expect(afterFailedAttempt.payoutAttemptedAt).not.toBeNull();

    // [C3] adminHold must now refuse — a naive status-only guard would let
    // this through (the batch is still APPROVED), silently re-opening a
    // batch whose amount may already be in flight at the provider.
    // expect.assertions guards against the catch block silently not
    // running at all (adminHold resolving instead of throwing).
    expect.assertions(9);
    try {
      await settlements.adminHold(batch.id, "should be refused");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      const response = (err as ConflictException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.statusCode).toBe(409);
      expect(response.errorCode).toBe("SETTLEMENT_PAYOUT_ALREADY_ATTEMPTED");
    }

    const stillApproved = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(stillApproved.status).toBe("APPROVED"); // hold did NOT go through

    // A later retry (no forced failure this time) must still complete
    // normally — the sentinel protects against hold/recompute, not against
    // ever finishing the payout.
    await payout.executeOne(batch.id);
    const sent = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(sent.status).toBe("SENT");
    expect(sent.netPayoutCents).toBe(afterFailedAttempt.netPayoutCents); // amount never moved
    const log = mockProvider.getPayoutLog().filter((p) => p.ref === batch.id);
    expect(log).toHaveLength(1); // exactly one successful transfer recorded, ever
  }, 30000);

  it("[j] [Fix round #3] a clawback line's demand SHRINKS on a later recompute (bagFeeCentsOverride raised after the fact) ⇒ clawbackAppliedAt is explicitly CLEARED, not left stale, so the residual stays recoverable", async () => {
    const { batchBuilder, settlements, payout } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 15000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    const { reservation, payment, totalCents } =
      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 15000,
        redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
      });

    // batch1: gross 15000, bagFee 0 (override), vat 0, withholding
    // round(15000*1%)=150 -> would-be-net demand = 15000-0-0-150=14850.
    const now1 = new Date("2026-08-02T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now1);
    const batch1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    await settlements.adminApprove(batch1.id, now1);
    await payout.executeOne(batch1.id);

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

    // batch2: fresh gross 20000, bagFee STILL 0 -> withholding
    // round(20000*1%)=200, available 19800 -> comfortably covers the
    // 14850 demand in full. Line fully resolved: clawbackCents=14850,
    // clawbackAppliedAt SET, clawbackBatchId=batch2.
    const day2 = new Date("2026-08-03T11:00:00.000Z");
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 20000,
      redeemedAt: day2,
    });
    const now2 = new Date("2026-08-04T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now2);

    const clawedLine = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(clawedLine.clawbackCents).toBe(14850);
    expect(clawedLine.clawbackAppliedAt).not.toBeNull();
    const batch2Id = clawedLine.clawbackBatchId!;
    const batch2Full = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch2Id },
    });
    expect(batch2Full.refundClawbackCents).toBe(14850);
    expect(batch2Full.status).toBe("CALCULATED");

    // [Fix round #3] Raise the merchant's bagFeeCentsOverride AFTER the
    // fact (a real, reachable admin action — settlements/pricing.
    // service.ts's per-merchant override is editable at any time), then
    // recompute batch2 again with NO new lines. batch1's frozen line
    // (whose fee fields never get rewritten again once its OWN batch is
    // SENT) still shows a fullDemandCents of 14850 — unchanged — but
    // batch2's OWN available amount shrinks: bagFee 15000, vat 3000,
    // withholding round(2000*1%)=20 -> available 20000-15000-3000-20 =
    // 1980, far below the 14850 demand.
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { bagFeeCentsOverride: 15000 },
    });
    const now3 = new Date("2026-08-05T02:00:00.000Z");
    const shrunkBatch2 = await batchBuilder.recomputeBatch(batch2Id, now3);

    expect(shrunkBatch2.bagFeeCents).toBe(15000);
    expect(shrunkBatch2.bagFeeVatCents).toBe(3000);
    expect(shrunkBatch2.withholdingCents).toBe(20);
    expect(shrunkBatch2.refundClawbackCents).toBe(1980); // shrunk from 14850
    expect(shrunkBatch2.netPayoutCents).toBe(0);
    expect(shrunkBatch2.status).toBe("HELD"); // 14850-1980=12870 still owed

    const shrunkLine = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(shrunkLine.clawbackCents).toBe(1980); // written DOWN from 14850
    // The critical assertion: clawbackAppliedAt must be explicitly
    // CLEARED, not left stale at its earlier (now-wrong) "resolved"
    // timestamp — a line under-recovered but still marked appliedAt-set
    // matches neither findMerchantsWithPendingClawback's nor any other
    // batch's candidate query's `clawbackAppliedAt IS NULL` filter,
    // silently orphaning the remaining 12870 forever once batch2 sends.
    expect(shrunkLine.clawbackAppliedAt).toBeNull();
    expect(shrunkLine.clawbackBatchId).toBe(batch2Id); // still tracked as batch2's

    // Recovery path proof: with bagFeeCentsOverride restored (a further
    // admin correction, or simply new gross arriving), the SAME line is
    // still discoverable and finishes resolving — proving the fix doesn't
    // just clear the flag but genuinely leaves the demand recoverable.
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { bagFeeCentsOverride: 0 },
    });
    const now4 = new Date("2026-08-06T02:00:00.000Z");
    const recoveredBatch2 = await batchBuilder.recomputeBatch(batch2Id, now4);
    expect(recoveredBatch2.refundClawbackCents).toBe(14850);
    expect(recoveredBatch2.status).toBe("CALCULATED");
    const recoveredLine = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(recoveredLine.clawbackCents).toBe(14850);
    expect(recoveredLine.clawbackAppliedAt).not.toBeNull();
  }, 30000);

  // =====================================================================
  // [Fix round #4] The invariant scenarios. Each is a reproducer for one
  // reachable shape of "the batch row was rewritten and a line row was
  // not" — and each ends on expectClawbackLedgerConsistent, which checks
  // the invariant rather than the example.
  // =====================================================================

  it("[k] [Fix round #4] a batch that can absorb NOTHING (negative availability) must RELEASE the clawback it previously recorded — line reset to 0 with the flag cleared, and the demand still visible to the recovery sweep", async () => {
    const { batchBuilder, settlements, payout } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 15000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    const { reservation, payment, totalCents } =
      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 15000,
        redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
      });

    // batch1: gross 15000, bagFee 0 (override), withholding 150 -> the
    // line's full clawback demand, frozen once batch1 is SENT, is 14850.
    const now1 = new Date("2026-08-02T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now1);
    const batch1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    await settlements.adminApprove(batch1.id, now1);
    await payout.executeOne(batch1.id);
    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        amountCents: totalCents,
        reason: "ADMIN",
        status: "DONE",
        requestedByType: "ADMIN",
        pspRefundId: `${SETTLEMENTS_TEST_TAG}-refund-k-${Date.now()}`,
      },
    });

    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 20000,
      redeemedAt: new Date("2026-08-03T11:00:00.000Z"),
    });

    // batch2 first pass, override still 0: gross 20000, withholding 200,
    // available 19800 — it absorbs the whole 14850 and marks the line
    // fully resolved. THIS is the state the defect needs: a stale, real,
    // non-zero value already written on the line.
    const now2 = new Date("2026-08-04T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now2);
    const batch2Initial = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id, id: { not: batch1.id } },
    });
    expect(batch2Initial.refundClawbackCents).toBe(14850);
    expect(batch2Initial.netPayoutCents).toBe(4950);
    const resolvedLine = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(resolvedLine.clawbackCents).toBe(14850);
    expect(resolvedLine.clawbackAppliedAt).not.toBeNull();
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // The reviewer's exact reproducer: raise bagFeeCentsOverride to 20000
    // against a gross of 20000. bagFee 20000, KDV 4000, withholding base
    // max(0, 20000-20000-4000) = 0 -> availableBeforeClawback = -4000, so
    // refundClawbackCents rederives to 0: this batch can now absorb
    // NOTHING, and must give back everything it had recorded.
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { bagFeeCentsOverride: 20000 },
    });
    const now2b = new Date("2026-08-04T03:00:00.000Z");
    const batch2 = await batchBuilder.recomputeBatch(batch2Initial.id, now2b);
    expect(batch2.bagFeeCents).toBe(20000);
    expect(batch2.bagFeeVatCents).toBe(4000);
    expect(batch2.withholdingCents).toBe(0);
    expect(batch2.refundClawbackCents).toBe(0);
    expect(batch2.netPayoutCents).toBe(0);
    // 4000 own fee deficit + the whole 14850 unmet clawback demand.
    expect(batch2.carriedShortfallCents).toBe(18850);
    expect(batch2.status).toBe("HELD");

    // THE DEFECT: the old allocation loop `break`ed on this candidate
    // before its write (remainingToAllocate was 0), so the line kept
    // clawbackCents = 14850 and a non-null clawbackAppliedAt from the
    // pass that HAD absorbed it, while the batch above recorded 0.
    // 14850 kuruş then matched neither findMerchantsWithPendingClawback
    // (clawbackAppliedAt IS NULL) nor any other batch's candidate query
    // (clawbackBatchId = their id), and resolveCarriedShortfall
    // deliberately never carries line-attributable demand — owed by
    // nobody, visible to no one.
    const line = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(line.clawbackCents).toBe(0);
    expect(line.clawbackAppliedAt).toBeNull();
    expect(line.clawbackBatchId).toBeNull();
    expect(
      await prisma.settlementClawbackAllocation.count({
        where: { batchId: batch2.id },
      }),
    ).toBe(0);
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // ...and the demand is genuinely still VISIBLE: the nightly cycle's
    // own clawback sweep (findMerchantsWithPendingClawback, unmodified
    // production code) picks this merchant up and opens a batch for it.
    // With the stale line, this predicate returned nothing at all.
    const now3 = new Date("2026-08-05T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now3);
    expect(
      await prisma.settlementBatch.count({
        where: { merchantId: merchant.id },
      }),
    ).toBe(3);

    // [Fix round #5] That sweep batch inherits batch2's own 4000 fee
    // deficit — and the handoff is now RECORDED on both sides, pinned to
    // batch2 specifically, instead of copied into a frozen column with
    // nothing on batch2 remembering it happened.
    const batch3 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id, id: { notIn: [batch1.id, batch2.id] } },
    });
    expect(batch3.inheritedExternalDemandCents).toBe(4000);
    expect(batch3.carriedDemandSourceBatchId).toBe(batch2.id);
    expect(batch3.status).toBe("HELD");
    expect(
      await prisma.settlementCarriedDemandClaim.findUnique({
        where: { claimantBatchId: batch3.id },
      }),
    ).toMatchObject({ sourceBatchId: batch2.id, amountCents: 4000 });
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // ...and genuinely still RECOVERABLE: restore the override and the
    // full 14850 comes back, in one pass.
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { bagFeeCentsOverride: 0 },
    });
    const recovered = await batchBuilder.recomputeBatch(
      batch2.id,
      new Date("2026-08-06T02:00:00.000Z"),
    );
    expect(recovered.refundClawbackCents).toBe(14850);
    expect(recovered.netPayoutCents).toBe(4950); // 20000-200 withholding-14850
    expect(recovered.status).toBe("CALCULATED");
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // [Fix round #5] THE OTHER HALF. batch2's 4000 fee deficit is now
    // CURED — it resolved to CALCULATED just above and owes nothing
    // forward. Before the claim ledger, batch3 still held a FROZEN
    // inheritedExternalDemandCents of 4000 that existed nowhere else, and
    // would have withheld it from the merchant's next gross: the same 4000
    // charged twice. expectClawbackLedgerConsistent could not see it,
    // because `inherited − carried` is self-consistent by construction —
    // which is why the external half is now checked against the claim row.
    const releasedBatch3 = await batchBuilder.recomputeBatch(
      batch3.id,
      new Date("2026-08-07T02:00:00.000Z"),
    );
    expect(releasedBatch3.inheritedExternalDemandCents).toBe(0);
    expect(releasedBatch3.carriedExternalDemandCents).toBe(0);
    expect(releasedBatch3.refundClawbackCents).toBe(0);
    expect(releasedBatch3.carriedShortfallCents).toBe(0);
    expect(releasedBatch3.netPayoutCents).toBe(0);
    expect(releasedBatch3.status).toBe("CALCULATED");
    expect(
      await prisma.settlementCarriedDemandClaim.findUnique({
        where: { claimantBatchId: batch3.id },
      }),
    ).toBeNull();
    // The PIN survives (identity, write-once) so the source stays known.
    expect(releasedBatch3.carriedDemandSourceBatchId).toBe(batch2.id);
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // Converges in any order: further recomputes of either change nothing.
    const kSnapshot = await ledgerSnapshot(prisma, merchant.id);
    await batchBuilder.recomputeBatch(
      batch2.id,
      new Date("2026-08-08T02:00:00.000Z"),
    );
    await batchBuilder.recomputeBatch(
      batch3.id,
      new Date("2026-08-09T02:00:00.000Z"),
    );
    expect(await ledgerSnapshot(prisma, merchant.id)).toEqual(kSnapshot);
  }, 30000);

  it("[l] [Fix round #4] a STARVED later candidate is written, not skipped: two lines this batch had fully resolved, availability shrinks, the first keeps a partial and the second is released to zero", async () => {
    const { batchBuilder, settlements, payout } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 5000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    // Two day-1 lines: demands 5000-50=4950 and 10000-100=9900 (14850
    // together). Older-redeemed first, so FIFO puts A ahead of B.
    const resA = await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 5000,
      redeemedAt: new Date("2026-08-01T09:00:00.000Z"),
    });
    const resB = await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 10000,
      redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
    });

    const now1 = new Date("2026-08-02T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now1);
    const batch1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    await settlements.adminApprove(batch1.id, now1);
    await payout.executeOne(batch1.id);
    for (const [i, r] of [resA, resB].entries()) {
      await prisma.refund.create({
        data: {
          paymentId: r.payment.id,
          amountCents: r.totalCents,
          reason: "ADMIN",
          status: "DONE",
          requestedByType: "ADMIN",
          pspRefundId: `${SETTLEMENTS_TEST_TAG}-refund-l-${i}-${Date.now()}`,
        },
      });
    }

    // batch2: gross 20000, override still 0 -> withholding 200, available
    // 19800, comfortably covering BOTH demands. Both lines fully resolved
    // by THIS batch.
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 20000,
      redeemedAt: new Date("2026-08-03T11:00:00.000Z"),
    });
    const now2 = new Date("2026-08-04T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now2);
    const batch2 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id, id: { not: batch1.id } },
    });
    expect(batch2.refundClawbackCents).toBe(14850);
    expect(batch2.netPayoutCents).toBe(4950);
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // Now shrink batch2's OWN availability: bagFee 16000, KDV 3200,
    // withholding round(800*1%)=8 -> available 20000-16000-3200-8 = 792.
    // FIFO gives all 792 to A (partial, flag cleared) and NOTHING to B —
    // which is exactly where the old loop hit `remainingToAllocate <= 0`
    // and `break`ed, leaving B's clawbackCents at 9900 and its flag set
    // while the batch above recorded a total of 792. Ledger says 10692
    // recovered; batch withheld 792.
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { bagFeeCentsOverride: 16000 },
    });
    const now3 = new Date("2026-08-05T02:00:00.000Z");
    const shrunk = await batchBuilder.recomputeBatch(batch2.id, now3);
    expect(shrunk.refundClawbackCents).toBe(792);
    expect(shrunk.carriedShortfallCents).toBe(14058); // 14850 - 792
    expect(shrunk.status).toBe("HELD");

    const lineA = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: resA.reservation.id },
    });
    const lineB = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: resB.reservation.id },
    });
    expect(lineA.clawbackCents).toBe(792);
    expect(lineA.clawbackAppliedAt).toBeNull();
    expect(lineA.clawbackBatchId).toBe(batch2.id);
    expect(lineB.clawbackCents).toBe(0);
    expect(lineB.clawbackAppliedAt).toBeNull();
    expect(lineB.clawbackBatchId).toBeNull();
    expect(lineA.clawbackCents + lineB.clawbackCents).toBe(
      shrunk.refundClawbackCents,
    );
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // Idempotence: repeat passes with unchanged inputs must produce
    // byte-identical batch, line and allocation rows.
    const snapshot = await ledgerSnapshot(prisma, merchant.id);
    await batchBuilder.recomputeBatch(
      batch2.id,
      new Date("2026-08-06T02:00:00.000Z"),
    );
    await batchBuilder.recomputeBatch(
      batch2.id,
      new Date("2026-08-07T02:00:00.000Z"),
    );
    expect(await ledgerSnapshot(prisma, merchant.id)).toEqual(snapshot);

    // And both demands are still fully recoverable afterwards.
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { bagFeeCentsOverride: 0 },
    });
    const restored = await batchBuilder.recomputeBatch(
      batch2.id,
      new Date("2026-08-08T02:00:00.000Z"),
    );
    expect(restored.refundClawbackCents).toBe(14850);
    expect(restored.status).toBe("CALCULATED");
    await expectClawbackLedgerConsistent(prisma, merchant.id);
  }, 30000);

  it("[m] [Fix round #4] TWO still-open batches hold partial claims on the SAME line: each re-derives its own share without forgiving it or stealing the other's — the instance the single owner-pointer could not represent at all", async () => {
    const { batchBuilder, settlements, payout } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 20000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

    const { reservation, payment, totalCents } =
      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 20000,
        redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
      });

    // batch1 SENT with override 0 -> the refunded line's full demand,
    // frozen from here on, is 20000-200 = 19800.
    const now1 = new Date("2026-08-02T02:00:00.000Z");
    await batchBuilder.runNightlyCycle(now1);
    const batch1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    await settlements.adminApprove(batch1.id, now1);
    await payout.executeOne(batch1.id);
    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        amountCents: totalCents,
        reason: "ADMIN",
        status: "DONE",
        requestedByType: "ADMIN",
        pspRefundId: `${SETTLEMENTS_TEST_TAG}-refund-m-${Date.now()}`,
      },
    });

    // batch2 (day 2): tiny availability — gross 20000 with a 16000 bag
    // fee leaves 792. It absorbs 792 of the 19800 and goes HELD, staying
    // OPEN (recomputable) with a live partial claim on the line.
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { bagFeeCentsOverride: 16000 },
    });
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 20000,
      redeemedAt: new Date("2026-08-03T11:00:00.000Z"),
    });
    await batchBuilder.runNightlyCycle(new Date("2026-08-04T02:00:00.000Z"));
    const batch2 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id, id: { not: batch1.id } },
    });
    expect(batch2.refundClawbackCents).toBe(792);
    expect(batch2.status).toBe("HELD");

    // batch3 (day 3): a big day — gross 100000, bagFee 16000, KDV 3200,
    // withholding round(80800*1%)=808 -> available 79992. It picks up the
    // REMAINDER (19800-792 = 19008) while batch2 is still open and still
    // holds its 792.
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 100000,
      redeemedAt: new Date("2026-08-05T11:00:00.000Z"),
    });
    await batchBuilder.runNightlyCycle(new Date("2026-08-06T02:00:00.000Z"));
    const batch3 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id, id: { notIn: [batch1.id, batch2.id] } },
    });
    expect(batch3.refundClawbackCents).toBe(19008);
    expect(batch3.status).toBe("CALCULATED");

    const afterBatch3 = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(afterBatch3.clawbackCents).toBe(19800);
    expect(afterBatch3.clawbackAppliedAt).not.toBeNull();
    const allocations = await prisma.settlementClawbackAllocation.findMany({
      where: { reservationId: reservation.id },
      orderBy: { amountCents: "asc" },
    });
    expect(allocations.map((a) => [a.batchId, a.amountCents])).toEqual([
      [batch2.id, 792],
      [batch3.id, 19008],
    ]);
    // batch2's own record is untouched by batch3's pass.
    expect(
      (
        await prisma.settlementBatch.findUniqueOrThrow({
          where: { id: batch2.id },
        })
      ).refundClawbackCents,
    ).toBe(792);
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // THE DEFECT, one step beyond the four that were reported: with
    // attribution INFERRED from SettlementLine.clawbackBatchId, batch3's
    // pass moved that pointer to itself, so batch2's own 792 became
    // indistinguishable from everyone else's. batch2's very next
    // recompute (adminRetry on a HELD batch — an ordinary operator
    // action) then computed its baseline as the FULL 19800, found nothing
    // outstanding, rederived refundClawbackCents to 0 and paid the 792
    // back out — while the line still claimed 19800 recovered. Recording
    // the attribution instead makes that unrepresentable: batch2 deletes
    // its own row, reads 19008 (batch3's, and only batch3's), and
    // re-derives its own 792 exactly.
    const retried = await settlements.adminRetry(
      batch2.id,
      new Date("2026-08-07T02:00:00.000Z"),
    );
    expect(retried.refundClawbackCents).toBe(792);
    const afterRetry = await prisma.settlementLine.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(afterRetry.clawbackCents).toBe(19800);
    expect(afterRetry.clawbackAppliedAt).not.toBeNull();
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // Both batches converge, in ANY operator order. [Fix round #5, LOW 1]
    // The two sequences below deliberately END ON DIFFERENT BATCHES —
    // b2,b3,b2 and then b3,b2,b3. While `clawbackBatchId` was projected
    // from the most RECENTLY WRITTEN allocation (a delete+re-insert stamps
    // a fresh createdAt), those two orders left different line rows, and
    // this assertion was green only because the original sequence happened
    // to end on batch2. Projecting from the greatest batchId is
    // order-independent, which is what "any order of operator actions
    // produces byte-identical rows" actually requires.
    const snapshot = await ledgerSnapshot(prisma, merchant.id);
    await batchBuilder.recomputeBatch(
      batch2.id,
      new Date("2026-08-08T02:00:00.000Z"),
    );
    await batchBuilder.recomputeBatch(
      batch3.id,
      new Date("2026-08-08T02:00:00.000Z"),
    );
    await batchBuilder.recomputeBatch(
      batch2.id,
      new Date("2026-08-09T02:00:00.000Z"),
    );
    const endingOnBatch2 = await ledgerSnapshot(prisma, merchant.id);
    expect(endingOnBatch2).toEqual(snapshot);

    await batchBuilder.recomputeBatch(
      batch3.id,
      new Date("2026-08-10T02:00:00.000Z"),
    );
    await batchBuilder.recomputeBatch(
      batch2.id,
      new Date("2026-08-11T02:00:00.000Z"),
    );
    await batchBuilder.recomputeBatch(
      batch3.id,
      new Date("2026-08-12T02:00:00.000Z"),
    );
    expect(await ledgerSnapshot(prisma, merchant.id)).toEqual(endingOnBatch2);
    await expectClawbackLedgerConsistent(prisma, merchant.id);
  }, 30000);

  it("[n] [Fix round #5] a HELD predecessor CURED by a very-late line (no fee edit at all) releases its successor's carried-demand claim — and if that successor's payout is already frozen, the recompute refuses to commit instead of silently under-paying", async () => {
    // Part 1 — the reviewer's "same shape with no fee edit": a HELD batch
    // that later receives a very-late line (createOrExtendBatch matches
    // HELD deliberately) re-derives its own fee deficit away while a
    // successor still holds a copy of it.
    const { batchBuilder, settlements, payout } = buildHarness(prisma);
    const merchant = await seedMerchant(prisma, {
      bagFeeCentsOverride: 20000,
    });
    merchantIds.push(merchant.id);
    const store = await seedStore(prisma, merchant.id);
    const bagTemplate = await seedBagTemplate(prisma, store.id, 20000);
    const offer = await seedOffer(prisma, bagTemplate.id, store.id, 20);

    // batch1 (day 1): gross 20000, bagFee 20000, KDV 4000, withholding
    // base max(0, 20000-20000-4000)=0 -> available -4000. HELD, owing 4000
    // forward. No refunds anywhere in this test — this is the pure
    // fee-deficit half of priorClawbackCents.
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 20000,
      redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
    });
    await batchBuilder.runNightlyCycle(new Date("2026-08-02T02:00:00.000Z"));
    const batch1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id },
    });
    expect(batch1.status).toBe("HELD");
    expect(batch1.carriedShortfallCents).toBe(4000);

    // batch2 (day 2): gross 100000, bagFee 20000, KDV 4000, withholding
    // round(76000*1%)=760 -> available 75240. It takes over batch1's 4000
    // and pays 71240.
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 100000,
      redeemedAt: new Date("2026-08-03T11:00:00.000Z"),
    });
    await batchBuilder.runNightlyCycle(new Date("2026-08-04T02:00:00.000Z"));
    const batch2 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchant.id, id: { not: batch1.id } },
    });
    expect(batch2.inheritedExternalDemandCents).toBe(4000);
    expect(batch2.carriedDemandSourceBatchId).toBe(batch1.id);
    expect(batch2.refundClawbackCents).toBe(4000);
    expect(batch2.netPayoutCents).toBe(71240); // 75240 - 4000
    expect(batch2.status).toBe("CALCULATED");
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // A VERY LATE line lands on day 1 — legitimate, and the exact path
    // createOrExtendBatch keeps open for a HELD batch. (15:00Z is 18:00
    // Europe/Istanbul, so it groups onto day 1; 23:00Z would already be
    // 02:00 on day 2 and would open a separate batch instead.) batch1 becomes
    // gross 120000, bagFee 40000, KDV 8000, withholding
    // PER-LINE — 0 on the original line (its own fee ate its gross) plus
    // round(76000*1%)=760 on the new one -> available
    // 120000-40000-8000-760 = 71240. Its deficit is GONE.
    await seedRedeemedPaidReservation(prisma, {
      storeId: store.id,
      offerId: offer.id,
      qty: 1,
      unitPriceCents: 100000,
      redeemedAt: new Date("2026-08-01T15:00:00.000Z"),
    });
    await batchBuilder.runNightlyCycle(new Date("2026-08-05T02:00:00.000Z"));
    const curedBatch1 = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batch1.id },
    });
    expect(curedBatch1.status).toBe("CALCULATED");
    expect(curedBatch1.carriedShortfallCents).toBe(0);
    expect(curedBatch1.netPayoutCents).toBe(71240);

    // batch2's very next recompute must RELEASE the claim — the demand
    // that justified it no longer exists. With the frozen copy, batch2
    // would have kept withholding 4000 forever: charged once by batch1
    // being short and again by batch2, for a shortfall that was cured.
    const releasedBatch2 = await batchBuilder.recomputeBatch(
      batch2.id,
      new Date("2026-08-06T02:00:00.000Z"),
    );
    expect(releasedBatch2.inheritedExternalDemandCents).toBe(0);
    expect(releasedBatch2.carriedExternalDemandCents).toBe(0);
    expect(releasedBatch2.refundClawbackCents).toBe(0);
    expect(releasedBatch2.netPayoutCents).toBe(75240); // the full 4000 back
    expect(
      await prisma.settlementCarriedDemandClaim.findUnique({
        where: { claimantBatchId: batch2.id },
      }),
    ).toBeNull();
    await expectClawbackLedgerConsistent(prisma, merchant.id);

    // Part 2 — the one corner that cannot be corrected arithmetically.
    // Same setup, but the successor's payout is APPROVED and SENT before
    // the predecessor is cured, so its 4000 is committed money that no
    // recompute can hand back. Returning it means INCREASING a payout,
    // and computeSettlement has no credit term (four audits fixed its
    // accounting identity; this round must not rework it). So the
    // predecessor's recompute refuses to commit, loudly and by name —
    // the same posture as C3's SETTLEMENT_PAYOUT_ALREADY_ATTEMPTED.
    const merchantB = await seedMerchant(prisma, {
      bagFeeCentsOverride: 20000,
    });
    merchantIds.push(merchantB.id);
    const storeB = await seedStore(prisma, merchantB.id);
    const tplB = await seedBagTemplate(prisma, storeB.id, 20000);
    const offerB = await seedOffer(prisma, tplB.id, storeB.id, 20);

    await seedRedeemedPaidReservation(prisma, {
      storeId: storeB.id,
      offerId: offerB.id,
      qty: 1,
      unitPriceCents: 20000,
      redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
    });
    await batchBuilder.runNightlyCycle(new Date("2026-08-02T02:00:00.000Z"));
    const bB1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchantB.id },
    });
    expect(bB1.status).toBe("HELD");

    await seedRedeemedPaidReservation(prisma, {
      storeId: storeB.id,
      offerId: offerB.id,
      qty: 1,
      unitPriceCents: 100000,
      redeemedAt: new Date("2026-08-03T11:00:00.000Z"),
    });
    await batchBuilder.runNightlyCycle(new Date("2026-08-04T02:00:00.000Z"));
    const bB2 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchantB.id, id: { not: bB1.id } },
    });
    await settlements.adminApprove(
      bB2.id,
      new Date("2026-08-04T03:00:00.000Z"),
    );
    await payout.executeOne(bB2.id);
    const sentB2 = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: bB2.id },
    });
    expect(sentB2.status).toBe("SENT");
    expect(sentB2.netPayoutCents).toBe(71240); // the 4000 left with it

    // Now cure the predecessor, through the real path: a very-late line
    // for day 1, picked up by the nightly cycle, which extends the HELD
    // batch and recomputes it. That recompute must refuse.
    await seedRedeemedPaidReservation(prisma, {
      storeId: storeB.id,
      offerId: offerB.id,
      qty: 1,
      unitPriceCents: 100000,
      redeemedAt: new Date("2026-08-01T15:00:00.000Z"),
    });
    // [Fix round #5, follow-up] The refusal is now COLLECTED per merchant,
    // not thrown out of the cycle — see test [o]. The batch is still
    // refused; what changed is that it can no longer take the rest of the
    // platform's night down with it.
    const refusedCycle = await batchBuilder.runNightlyCycle(
      new Date("2026-08-05T02:00:00.000Z"),
    );
    expect(
      refusedCycle.failures.filter((f) => f.merchantId === merchantB.id),
    ).toEqual([
      {
        merchantId: merchantB.id,
        stage: "batch",
        message: expect.stringContaining(
          "SETTLEMENT_CARRIED_DEMAND_ALREADY_COLLECTED",
        ),
      },
    ]);
    expect(refusedCycle.batchIds).not.toContain(bB1.id);

    // The recompute transaction rolled back: the predecessor keeps its
    // previous, self-consistent MONEY state, the successor's sent payout is
    // untouched, and the claim still stands as the record of what was
    // collected. An operator gets a named signal instead of a silent 4000
    // under-payment. (The new line itself IS attached — createOrExtendBatch
    // inserts lines in its own transaction before recomputing, as it always
    // has — so the batch is visibly "has an unaccounted line", which is
    // precisely the thing needing reconciliation.)
    expect(
      await prisma.settlementLine.count({ where: { batchId: bB1.id } }),
    ).toBe(2);
    const refusedB1 = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: bB1.id },
    });
    expect(refusedB1.status).toBe("HELD");
    expect(refusedB1.grossCents).toBe(20000);
    expect(refusedB1.netPayoutCents).toBe(0);
    expect(refusedB1.carriedShortfallCents).toBe(4000);
    expect(
      (
        await prisma.settlementBatch.findUniqueOrThrow({
          where: { id: bB2.id },
        })
      ).netPayoutCents,
    ).toBe(71240);
    expect(
      await prisma.settlementCarriedDemandClaim.findUnique({
        where: { claimantBatchId: bB2.id },
      }),
    ).toMatchObject({ sourceBatchId: bB1.id, amountCents: 4000 });
    await expectClawbackLedgerConsistent(prisma, merchantB.id);
  }, 30000);

  it("[o] [Fix round #5, follow-up] one merchant needing reconciliation does NOT stop the rest of the platform settling that night — the failure is isolated, collected and reported", async () => {
    const { batchBuilder, settlements, payout } = buildHarness(prisma);

    // Merchant A: driven into the one state that makes recomputeBatch
    // refuse (a predecessor cured after a successor's payout was already
    // sent). Its late line is redeemed EARLIEST, and runNightlyCycle's
    // eligibility scan is ordered by redeemedAt ASC, so A is processed
    // FIRST — with no isolation, everyone after it silently loses their
    // night.
    const merchantA = await seedMerchant(prisma, {
      bagFeeCentsOverride: 20000,
    });
    merchantIds.push(merchantA.id);
    const storeA = await seedStore(prisma, merchantA.id);
    const tplA = await seedBagTemplate(prisma, storeA.id, 20000);
    const offerA = await seedOffer(prisma, tplA.id, storeA.id, 20);

    await seedRedeemedPaidReservation(prisma, {
      storeId: storeA.id,
      offerId: offerA.id,
      qty: 1,
      unitPriceCents: 20000,
      redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
    });
    await batchBuilder.runNightlyCycle(new Date("2026-08-02T02:00:00.000Z"));
    const aB1 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchantA.id },
    });
    expect(aB1.status).toBe("HELD");

    await seedRedeemedPaidReservation(prisma, {
      storeId: storeA.id,
      offerId: offerA.id,
      qty: 1,
      unitPriceCents: 100000,
      redeemedAt: new Date("2026-08-03T11:00:00.000Z"),
    });
    await batchBuilder.runNightlyCycle(new Date("2026-08-04T02:00:00.000Z"));
    const aB2 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchantA.id, id: { not: aB1.id } },
    });
    await settlements.adminApprove(
      aB2.id,
      new Date("2026-08-04T03:00:00.000Z"),
    );
    await payout.executeOne(aB2.id);
    // The very-late line that will cure aB1 and trip the guard.
    await seedRedeemedPaidReservation(prisma, {
      storeId: storeA.id,
      offerId: offerA.id,
      qty: 1,
      unitPriceCents: 100000,
      redeemedAt: new Date("2026-08-01T15:00:00.000Z"),
    });

    // Merchant B: an ordinary merchant with an ordinary redemption,
    // redeemed LATER than A's late line, so it is processed after A.
    const merchantB2 = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
    merchantIds.push(merchantB2.id);
    const storeB2 = await seedStore(prisma, merchantB2.id);
    const tplB2 = await seedBagTemplate(prisma, storeB2.id, 30000);
    const offerB2 = await seedOffer(prisma, tplB2.id, storeB2.id, 20);
    await seedRedeemedPaidReservation(prisma, {
      storeId: storeB2.id,
      offerId: offerB2.id,
      qty: 1,
      unitPriceCents: 30000,
      redeemedAt: new Date("2026-08-01T18:00:00.000Z"),
    });

    const cycle = await batchBuilder.runNightlyCycle(
      new Date("2026-08-05T02:00:00.000Z"),
    );

    // A is refused, by name, and recorded.
    expect(cycle.failures.map((f) => f.merchantId)).toContain(merchantA.id);
    const aFailure = cycle.failures.find((f) => f.merchantId === merchantA.id)!;
    expect(aFailure.stage).toBe("batch");
    expect(aFailure.message).toContain(
      "SETTLEMENT_CARRIED_DEMAND_ALREADY_COLLECTED",
    );
    const refusedA1 = await prisma.settlementBatch.findUniqueOrThrow({
      where: { id: aB1.id },
    });
    expect(refusedA1.status).toBe("HELD"); // rolled back, unchanged
    expect(refusedA1.grossCents).toBe(20000);

    // THE POINT: B still settled, correctly, in the SAME cycle.
    // gross 30000, bagFee 0, withholding round(30000*1%)=300 -> net 29700.
    const batchB2 = await prisma.settlementBatch.findFirstOrThrow({
      where: { merchantId: merchantB2.id },
    });
    expect(batchB2.grossCents).toBe(30000);
    expect(batchB2.withholdingCents).toBe(300);
    expect(batchB2.netPayoutCents).toBe(29700);
    expect(batchB2.status).toBe("CALCULATED");
    expect(cycle.batchIds).toContain(batchB2.id);
    expect(cycle.failures.map((f) => f.merchantId)).not.toContain(
      merchantB2.id,
    );
    await expectClawbackLedgerConsistent(prisma, merchantB2.id);

    // ...and the batch is genuinely payable, not merely computed.
    await settlements.adminApprove(
      batchB2.id,
      new Date("2026-08-05T03:00:00.000Z"),
    );
    await payout.executeOne(batchB2.id);
    expect(
      (
        await prisma.settlementBatch.findUniqueOrThrow({
          where: { id: batchB2.id },
        })
      ).status,
    ).toBe("SENT");
  }, 30000);
});
