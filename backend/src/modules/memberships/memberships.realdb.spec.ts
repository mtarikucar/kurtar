import { PrismaClient } from "@prisma/client";
import { PublicHolidayService } from "../settlements/public-holiday.service";
import { PricingService } from "../settlements/pricing.service";
import { SettlementBatchBuilderService } from "../settlements/settlement-batch-builder.service";
import { MembershipOffsetService } from "./membership-offset.service";
import { MembershipRenewalCronService } from "./membership-renewal-cron.service";

/**
 * Real-DB proof of the [Fix round] policy decisions P1 (forgiveness must
 * leave an audit trail, never be silent) and I6/I7 (membershipExemptUntil
 * honoured retroactively; a CANCELLED subscription is never renewed) —
 * mirrors settlements.realdb.spec.ts's harness-per-file discipline (every
 * service constructed directly, no Nest DI container; every seeded row
 * scoped under this file's own tag and cleaned up by merchantId, never a
 * table-wide deleteMany).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const MEMBERSHIPS_TEST_TAG = "memberships-realdb-test";

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[memberships.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
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
  const renewalCron = new MembershipRenewalCronService(
    prisma as never,
    pricing,
  );
  return { batchBuilder, renewalCron };
}

let taxIdCounter = 0;
async function seedMerchant(
  prisma: PrismaClient,
  opts: {
    membershipExemptUntil?: Date | null;
    bagFeeCentsOverride?: number | null;
  } = {},
) {
  return prisma.merchant.create({
    data: {
      legalName: "Realdb Memberships Test Gida A.S.",
      tradeName: "Realdb Memberships Test Firin",
      taxId: `${MEMBERSHIPS_TEST_TAG}-${Date.now()}-${taxIdCounter++}`,
      iban: "TR000006701000000000000003",
      verificationStatus: "APPROVED",
      membershipExemptUntil: opts.membershipExemptUntil ?? null,
      bagFeeCentsOverride: opts.bagFeeCentsOverride ?? null,
    },
  });
}

async function seedStore(prisma: PrismaClient, merchantId: string) {
  return prisma.store.create({
    data: {
      merchantId,
      name: "Realdb Memberships Store",
      address: "Test Sk. No:4",
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
      title: "Realdb Membership Bag",
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
    data: { phoneE164: `+9055521${n.toString().padStart(6, "0")}` },
  });
  const rn = reservationCounter++;
  const totalCents = params.unitPriceCents * params.qty;
  const reservation = await prisma.reservation.create({
    data: {
      code: `${MEMBERSHIPS_TEST_TAG}-R-${Date.now()}-${rn}`,
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
  await prisma.payment.create({
    data: {
      reservationId: reservation.id,
      provider: "MOCK",
      merchantOid: `${MEMBERSHIPS_TEST_TAG}-OID-${Date.now()}-${rn}`,
      amountCents: totalCents,
      status: "PAID",
      idempotencyKey: `${MEMBERSHIPS_TEST_TAG}-IDEMP-${Date.now()}-${rn}`,
      paidAt: new Date(),
    },
  });
  return { reservation, totalCents };
}

async function cleanupMerchant(prisma: PrismaClient, merchantId: string) {
  const batches = await prisma.settlementBatch.findMany({
    where: { merchantId },
    select: { id: true },
  });
  const batchIds = batches.map((b) => b.id);
  await prisma.settlementLine.deleteMany({
    where: { batchId: { in: batchIds } },
  });
  await prisma.settlementBatch.deleteMany({ where: { merchantId } });

  const subs = await prisma.membershipSubscription.findMany({
    where: { merchantId },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: {
      entity: "MembershipSubscription",
      entityId: { in: subs.map((s) => s.id) },
    },
  });
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

d(
  "Membership subscriptions — real DB renewal + retroactive exemption proofs",
  () => {
    let prisma: PrismaClient;
    const merchantIds: string[] = [];

    beforeAll(() => {
      const url = new URL(TEST_DATABASE_URL!);
      url.searchParams.set("connection_limit", "10");
      url.searchParams.set("pool_timeout", "30");
      prisma = new PrismaClient({
        datasources: { db: { url: url.toString() } },
      });
    });

    afterAll(async () => {
      if (!prisma) return;
      for (const merchantId of merchantIds) {
        await safeCleanup(`merchant ${merchantId}`, () =>
          cleanupMerchant(prisma, merchantId),
        );
      }
      await prisma.$disconnect();
    });

    it("[P1] a period rolling over with an unrecovered balance is forgiven with an explicit AuditLog row and writtenOffCents, flips to PAST_DUE, then self-heals to ACTIVE on the first real offset of the new period", async () => {
      const { batchBuilder, renewalCron } = buildHarness(prisma);
      const pricing = new PricingService(prisma as never);
      // bagFeeCentsOverride: 0 — isolates the membership-offset arithmetic
      // from the bag-fee/VAT deduction (same technique settlements.realdb.
      // spec.ts's test [d] uses), so the self-heal assertion below is
      // actually exercising a real offset, not coincidentally zero because
      // the bag fee alone already exceeds a 101-kuruş gross.
      const merchant = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
      merchantIds.push(merchant.id);
      const store = await seedStore(prisma, merchant.id);
      const bagTemplate = await seedBagTemplate(prisma, store.id, 101);
      const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

      // Priced at 500 (+VAT 100 = 600 total due) but the merchant never earns
      // anything against it this period — a dormant merchant, the exact case
      // P1's forgiveness policy is designed for.
      const sub = await prisma.membershipSubscription.create({
        data: {
          merchantId: merchant.id,
          anchorDate: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
          priceCents: 500,
          vatCents: 100,
          status: "TRIAL",
          outstandingCents: 600,
          outstandingVatCents: 100,
        },
      });

      // runOnce sweeps EVERY due subscription platform-wide by design (that
      // is correct production behaviour) — under --maxWorkers=2 that can
      // legitimately include another spec file's own due subscription
      // created concurrently, so `result.renewed`/`writtenOff` are NOT
      // asserted as exact counts here (>= 1 only); everything below checks
      // THIS test's own subscription row and audit rows specifically,
      // which is immune to that cross-file overlap.
      const rolloverNow = new Date("2027-01-02T03:00:00.000Z");
      const result = await renewalCron.runOnce(rolloverNow);
      expect(result.renewed).toBeGreaterThanOrEqual(1);
      expect(result.writtenOff).toBeGreaterThanOrEqual(1);

      const renewed = await prisma.membershipSubscription.findUniqueOrThrow({
        where: { id: sub.id },
      });
      // The NEW period starts completely fresh — the 600 unrecovered kuruş is
      // NOT carried forward as debt onto the new period's outstandingCents;
      // it is exactly the new period's own (indexed) price+VAT, resolved
      // independently here to avoid hardcoding the seed migration's price.
      expect(renewed.currentPeriodStart.toISOString()).toBe(
        "2027-01-01T00:00:00.000Z",
      );
      const expectedNewPricing = await pricing.resolvePlatformPricing(
        prisma as never,
        renewed.currentPeriodStart,
      );
      const expectedNewVat = Math.round(
        (expectedNewPricing.membershipAnnualCents * 20) / 100,
      );
      expect(renewed.priceCents).toBe(expectedNewPricing.membershipAnnualCents);
      expect(renewed.vatCents).toBe(expectedNewVat);
      expect(renewed.outstandingCents).toBe(
        expectedNewPricing.membershipAnnualCents + expectedNewVat,
      );
      // But the forgiven 600 is TRACKED, permanently and explicitly — not
      // silently absorbed into the fresh balance above.
      expect(renewed.writtenOffCents).toBe(600);
      expect(renewed.status).toBe("PAST_DUE");

      const auditRows = await prisma.auditLog.findMany({
        where: { entity: "MembershipSubscription", entityId: sub.id },
      });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].action).toBe("membership.renewal.written_off");
      expect(auditRows[0].diffJson).toMatchObject({
        merchantId: merchant.id,
        writtenOffCents: 600,
      });

      // A finance person's exact question from the review: "how much
      // membership revenue did we write off, for this merchant, ever" — a
      // plain sum, no joins.
      const lifetimeWriteOff = await prisma.membershipSubscription.aggregate({
        where: { merchantId: merchant.id },
        _sum: { writtenOffCents: true },
      });
      expect(lifetimeWriteOff._sum.writtenOffCents).toBe(600);

      // Self-heals: the NEW period's first real settlement offset flips
      // PAST_DUE -> ACTIVE (membership-offset.service.ts's needsActivation
      // treats TRIAL and PAST_DUE identically).
      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 101,
        redeemedAt: new Date("2027-01-05T11:00:00.000Z"),
      });
      await batchBuilder.runNightlyCycle(new Date("2027-01-06T02:00:00.000Z"));

      const afterOffset = await prisma.membershipSubscription.findUniqueOrThrow(
        { where: { id: sub.id } },
      );
      expect(afterOffset.status).toBe("ACTIVE");
      expect(afterOffset.outstandingCents).toBeLessThan(
        renewed.outstandingCents,
      );
    }, 30000);

    it("[P1] a period that closes fully recovered has nothing to forgive — no AuditLog row, writtenOffCents untouched, status not demoted", async () => {
      const { renewalCron } = buildHarness(prisma);
      const merchant = await seedMerchant(prisma);
      merchantIds.push(merchant.id);

      const sub = await prisma.membershipSubscription.create({
        data: {
          merchantId: merchant.id,
          anchorDate: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
          priceCents: 500,
          vatCents: 100,
          status: "ACTIVE",
          outstandingCents: 0, // fully recovered before renewal
          outstandingVatCents: 0,
          periodPaidAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      });

      // See the previous test's comment — runOnce sweeps platform-wide, so
      // only >= is safe under --maxWorkers=2; the scoped checks below (this
      // subscription's own writtenOffCents/status, and its own AuditLog
      // rows) are what actually proves this test's claim.
      const result = await renewalCron.runOnce(
        new Date("2027-01-02T03:00:00.000Z"),
      );
      expect(result.renewed).toBeGreaterThanOrEqual(1);

      const renewed = await prisma.membershipSubscription.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(renewed.writtenOffCents).toBe(0);
      expect(renewed.status).toBe("ACTIVE"); // NOT demoted to PAST_DUE — nothing was forgiven

      const auditRows = await prisma.auditLog.findMany({
        where: { entity: "MembershipSubscription", entityId: sub.id },
      });
      expect(auditRows).toHaveLength(0);
    }, 30000);

    it("[I7] a CANCELLED subscription past its currentPeriodEnd is never renewed or re-billed", async () => {
      const { renewalCron } = buildHarness(prisma);
      const merchant = await seedMerchant(prisma);
      merchantIds.push(merchant.id);

      const sub = await prisma.membershipSubscription.create({
        data: {
          merchantId: merchant.id,
          anchorDate: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
          priceCents: 500,
          vatCents: 100,
          status: "CANCELLED",
          outstandingCents: 300, // would have been forgiven/renewed if the filter were missing
          outstandingVatCents: 50,
        },
      });

      // NOT asserting result.renewed === 0 here — under --maxWorkers=2
      // another spec file's OWN due subscription can legitimately be swept
      // in the same platform-wide call. What actually proves I7 is that
      // THIS CANCELLED subscription specifically was skipped (checked
      // below): untouched period, untouched balance, no audit row.
      await renewalCron.runOnce(new Date("2027-06-01T03:00:00.000Z"));

      const untouched = await prisma.membershipSubscription.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(untouched.currentPeriodEnd.toISOString()).toBe(
        "2027-01-01T00:00:00.000Z",
      ); // completely unchanged
      expect(untouched.outstandingCents).toBe(300);
      expect(untouched.writtenOffCents).toBe(0);
      expect(untouched.status).toBe("CANCELLED");

      const auditRows = await prisma.auditLog.findMany({
        where: { entity: "MembershipSubscription", entityId: sub.id },
      });
      expect(auditRows).toHaveLength(0);
    }, 30000);

    it("[I6] granting membershipExemptUntil AFTER a subscription already exists retroactively pauses collection for any period whose date falls before the new cutoff", async () => {
      const { batchBuilder } = buildHarness(prisma);
      // Created with NO exemption at all. bagFeeCentsOverride: 0 — same
      // isolation as the P1 test above: WITHOUT the exemption, this exact
      // shape (gross 101, 0 bag fee) is settlements.realdb.spec.ts test [d]'s
      // own setup, which offsets a real, nonzero 100 kuruş — so this test's
      // "membershipOffsetCents is 0" assertion below is actually proving the
      // exemption path fired, not a coincidental fee-deficit zero.
      const merchant = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
      merchantIds.push(merchant.id);
      const store = await seedStore(prisma, merchant.id);
      const bagTemplate = await seedBagTemplate(prisma, store.id, 101);
      const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

      const sub = await prisma.membershipSubscription.create({
        data: {
          merchantId: merchant.id,
          anchorDate: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
          priceCents: 500,
          vatCents: 100,
          status: "TRIAL",
          outstandingCents: 600,
          outstandingVatCents: 100,
        },
      });

      // GTM action, well AFTER creation: grant founding-member status covering
      // this reservation's redemption date.
      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { membershipExemptUntil: new Date("2026-09-01T00:00:00.000Z") },
      });

      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 101,
        redeemedAt: new Date("2026-08-01T11:00:00.000Z"), // before the new cutoff
      });
      await batchBuilder.runNightlyCycle(new Date("2026-08-02T02:00:00.000Z"));

      const batch = await prisma.settlementBatch.findFirstOrThrow({
        where: { merchantId: merchant.id },
      });
      // Collection is PAUSED for this period, not forgiven — the stored
      // balance is untouched, but membershipOffsetCents is 0 for this batch.
      expect(batch.membershipOffsetCents).toBe(0);

      const subAfter = await prisma.membershipSubscription.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(subAfter.outstandingCents).toBe(600); // untouched — paused, not written off
      expect(subAfter.status).toBe("TRIAL"); // never activated — no offset ever applied
    }, 30000);
  },
);
