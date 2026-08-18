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
      //
      // [Fix round #2, minor] Dates deliberately kept INSIDE 2026 (no
      // earlier than the seed migration's platform_pricing floor,
      // 2026-01-01) and well clear of settlements.realdb.spec.ts test
      // [d]'s subscription (currentPeriodEnd 2027-01-01) — runOnce sweeps
      // EVERY due subscription platform-wide (correct production
      // behaviour), so under --maxWorkers=2 a `now` at or past
      // 2027-01-01 here would ALSO renew/reset that OTHER file's
      // subscription mid-test. Fixing the assertion side alone (>=
      // instead of ===, already done) isn't enough — the SIDE EFFECT of
      // mutating another file's row is still real regardless of what
      // this file asserts about it; every `now` this file ever passes to
      // runOnce now stays under a ceiling no other spec file's fixture
      // reaches.
      const sub = await prisma.membershipSubscription.create({
        data: {
          merchantId: merchant.id,
          anchorDate: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
          priceCents: 500,
          vatCents: 100,
          status: "TRIAL",
          outstandingCents: 600,
          outstandingVatCents: 100,
        },
      });

      // Still >= (not ===) as defense in depth — see the note above.
      const rolloverNow = new Date("2026-06-02T03:00:00.000Z");
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
        "2026-06-01T00:00:00.000Z",
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
      // silently absorbed into the fresh balance above. [Fix round #2,
      // P1-minor] Net/VAT split too — writtenOffCents alone (600) would
      // overstate forgiven REVENUE by the 100 kuruş of VAT in it.
      expect(renewed.writtenOffCents).toBe(600);
      expect(renewed.writtenOffVatCents).toBe(100);
      expect(renewed.status).toBe("PAST_DUE");

      const auditRows = await prisma.auditLog.findMany({
        where: { entity: "MembershipSubscription", entityId: sub.id },
      });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].action).toBe("membership.renewal.written_off");
      expect(auditRows[0].diffJson).toMatchObject({
        merchantId: merchant.id,
        writtenOffCents: 600,
        writtenOffVatCents: 100,
        writtenOffNetCents: 500,
      });

      // A finance person's exact question from the review: "how much
      // membership REVENUE (not VAT) did we write off, for this merchant,
      // ever" — writtenOffCents - writtenOffVatCents, a plain aggregate,
      // no joins.
      const lifetimeWriteOff = await prisma.membershipSubscription.aggregate({
        where: { merchantId: merchant.id },
        _sum: { writtenOffCents: true, writtenOffVatCents: true },
      });
      expect(lifetimeWriteOff._sum.writtenOffCents).toBe(600);
      expect(lifetimeWriteOff._sum.writtenOffVatCents).toBe(100);
      expect(
        lifetimeWriteOff._sum.writtenOffCents! -
          lifetimeWriteOff._sum.writtenOffVatCents!,
      ).toBe(500); // true forgiven revenue, VAT excluded

      // Self-heals: the NEW period's first real settlement offset flips
      // PAST_DUE -> ACTIVE (membership-offset.service.ts's needsActivation
      // treats TRIAL and PAST_DUE identically).
      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 101,
        redeemedAt: new Date("2026-06-05T11:00:00.000Z"),
      });
      await batchBuilder.runNightlyCycle(new Date("2026-06-06T02:00:00.000Z"));

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

      // [Fix round #2, minor] Same INSIDE-2026 window as the test above —
      // kept clear of settlements.realdb.spec.ts test [d]'s 2027-01-01
      // fixture (and no earlier than the seed pricing floor) so this
      // file's own runOnce sweep can never touch it.
      const sub = await prisma.membershipSubscription.create({
        data: {
          merchantId: merchant.id,
          anchorDate: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
          priceCents: 500,
          vatCents: 100,
          status: "ACTIVE",
          outstandingCents: 0, // fully recovered before renewal
          outstandingVatCents: 0,
          periodPaidAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      });

      // See the previous test's comment — runOnce sweeps platform-wide, so
      // only >= is safe under --maxWorkers=2; the scoped checks below (this
      // subscription's own writtenOffCents/status, and its own AuditLog
      // rows) are what actually proves this test's claim.
      const result = await renewalCron.runOnce(
        new Date("2026-06-02T03:00:00.000Z"),
      );
      expect(result.renewed).toBeGreaterThanOrEqual(1);

      const renewed = await prisma.membershipSubscription.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(renewed.writtenOffCents).toBe(0);
      expect(renewed.writtenOffVatCents).toBe(0);
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

      // [Fix round #2, minor] Same INSIDE-2026 window — kept clear of
      // settlements.realdb.spec.ts test [d]'s 2027-01-01 fixture (and no
      // earlier than the seed pricing floor — moot for THIS subscription
      // since CANCELLED never reaches pricing resolution, but keeping the
      // whole file's convention consistent).
      const sub = await prisma.membershipSubscription.create({
        data: {
          merchantId: merchant.id,
          anchorDate: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
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
      await renewalCron.runOnce(new Date("2026-09-01T03:00:00.000Z"));

      const untouched = await prisma.membershipSubscription.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(untouched.currentPeriodEnd.toISOString()).toBe(
        "2026-06-01T00:00:00.000Z",
      ); // completely unchanged
      expect(untouched.outstandingCents).toBe(300);
      expect(untouched.writtenOffCents).toBe(0);
      expect(untouched.writtenOffVatCents).toBe(0);
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

    it("[Fix round #2, I6-residual] a batch WITH an already-committed prior offset does not lose that offset once exemption is granted retroactively — the double-loss the re-review caught", async () => {
      const { batchBuilder } = buildHarness(prisma);
      // bagFeeCentsOverride: 0, gross 5051 -> withholding round(5051*1%)=51
      // -> available 5000 exactly. Subscription due 6000 (5000 net + 1000
      // VAT, the reviewer's own recurring example) -> this FIRST pass
      // offsets a real 5000 (PARTIAL — 1000 of the 6000 due remains),
      // matching the re-review's own worked numbers exactly: "subscription
      // outstanding 6000 -> 1000".
      const merchant = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
      merchantIds.push(merchant.id);
      const store = await seedStore(prisma, merchant.id);
      const bagTemplate = await seedBagTemplate(prisma, store.id, 5051);
      const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

      const sub = await prisma.membershipSubscription.create({
        data: {
          merchantId: merchant.id,
          anchorDate: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
          priceCents: 5000,
          vatCents: 1000,
          status: "TRIAL",
          outstandingCents: 6000,
          outstandingVatCents: 1000,
        },
      });

      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 5051,
        redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
      });
      const now1 = new Date("2026-08-02T02:00:00.000Z");
      await batchBuilder.runNightlyCycle(now1);

      const batch = await prisma.settlementBatch.findFirstOrThrow({
        where: { merchantId: merchant.id },
      });
      expect(batch.grossCents).toBe(5051);
      expect(batch.withholdingCents).toBe(51);
      expect(batch.membershipOffsetCents).toBe(5000); // the batch's real, committed offset
      // Proportional VAT split of a PARTIAL offset: round(5000*1000/6000).
      expect(batch.membershipOffsetVatCents).toBe(833);
      expect(batch.netPayoutCents).toBe(0); // 5000 available, all 5000 offset
      expect(batch.status).toBe("CALCULATED");

      const subAfterFirstPass =
        await prisma.membershipSubscription.findUniqueOrThrow({
          where: { id: sub.id },
        });
      expect(subAfterFirstPass.outstandingCents).toBe(1000); // 6000 - 5000
      expect(subAfterFirstPass.outstandingVatCents).toBe(167); // 1000 - 833
      expect(subAfterFirstPass.status).toBe("ACTIVE"); // TRIAL -> ACTIVE on the real offset

      // GTM action, well AFTER this batch already committed its offset:
      // founding status granted retroactively, covering this batch's
      // period date (2026-08-01).
      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { membershipExemptUntil: new Date("2026-09-01T00:00:00.000Z") },
      });

      // Recompute the SAME batch again — the operator's/cron's natural
      // next touch (an extend, a retry, an approve's pre-lock recompute
      // all funnel through the exact same recomputeBatch call). Before
      // this fix, this would have reset membershipOffsetCents/VatCents to
      // 0 (feeding computeSettlement an artificial due=0), flipping
      // netPayoutCents from 0 to 5000 — paying the merchant 5000 THEY
      // ALREADY effectively kept via the subscription's own balance
      // already being reduced. Must be a true no-op.
      const now2 = new Date("2026-08-03T02:00:00.000Z");
      const recomputed = await batchBuilder.recomputeBatch(batch.id, now2);
      expect(recomputed.membershipOffsetCents).toBe(5000); // UNCHANGED, not reset to 0
      expect(recomputed.membershipOffsetVatCents).toBe(833); // UNCHANGED
      expect(recomputed.netPayoutCents).toBe(0); // UNCHANGED — the 5000 the bug would have paid out again

      // A second no-op recompute must ALSO reproduce the same numbers.
      const recomputedAgain = await batchBuilder.recomputeBatch(batch.id, now2);
      expect(recomputedAgain.membershipOffsetCents).toBe(5000);
      expect(recomputedAgain.netPayoutCents).toBe(0);

      // The subscription itself is genuinely untouched by exemption —
      // paused collection going forward, not a re-derivation of what this
      // batch already, correctly, took.
      const subAfterExemption =
        await prisma.membershipSubscription.findUniqueOrThrow({
          where: { id: sub.id },
        });
      expect(subAfterExemption.outstandingCents).toBe(1000);
      expect(subAfterExemption.outstandingVatCents).toBe(167);
      expect(subAfterExemption.status).toBe("ACTIVE");
    }, 30000);

    it("[Fix round #3, LOW] the exempt branch's restored offset is CLAMPED by a later shrinking recompute ⇒ the returned VAT is proportional to what was actually applied, not the full original share", async () => {
      const { batchBuilder } = buildHarness(prisma);
      const merchant = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
      merchantIds.push(merchant.id);
      const store = await seedStore(prisma, merchant.id);
      const bagTemplate = await seedBagTemplate(prisma, store.id, 5051);
      const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

      const sub = await prisma.membershipSubscription.create({
        data: {
          merchantId: merchant.id,
          anchorDate: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
          priceCents: 5000,
          vatCents: 1000,
          status: "TRIAL",
          outstandingCents: 6000,
          outstandingVatCents: 1000,
        },
      });

      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 5051,
        redeemedAt: new Date("2026-08-01T11:00:00.000Z"),
      });
      const now1 = new Date("2026-08-02T02:00:00.000Z");
      await batchBuilder.runNightlyCycle(now1);

      const batch = await prisma.settlementBatch.findFirstOrThrow({
        where: { merchantId: merchant.id },
      });
      // gross 5051, bagFee 0, vat 0, withholding round(5051*1%)=51 ->
      // available 5000. Due 6000 (5000+1000) -> PARTIAL clear of 5000 ->
      // proportional VAT round(5000*1000/6000)=833.
      expect(batch.membershipOffsetCents).toBe(5000);
      expect(batch.membershipOffsetVatCents).toBe(833);

      // GTM action: founding status granted retroactively, covering this
      // batch's period.
      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { membershipExemptUntil: new Date("2026-09-01T00:00:00.000Z") },
      });

      // First exempt recompute — availability UNCHANGED (5000, same as
      // before) -> the restored offset (5000/833) is NOT clamped, a full
      // clear -> matches the round-2 test's already-covered case exactly
      // (VAT returned in full). Sanity-checked here before shrinking.
      const now2 = new Date("2026-08-03T02:00:00.000Z");
      const exemptUnclamped = await batchBuilder.recomputeBatch(batch.id, now2);
      expect(exemptUnclamped.membershipOffsetCents).toBe(5000);
      expect(exemptUnclamped.membershipOffsetVatCents).toBe(833);

      // [Fix round #3, LOW] NOW shrink this batch's own availability while
      // STILL exempt (a bagFeeCentsOverride edit — same lever test [j] in
      // settlements.realdb.spec.ts uses): bagFee 4000, vat 800, withholding
      // round(max(0,5051-4000-800)*1%)=round(2.51)=3 -> available
      // 5051-4000-800-3=248. The exempt branch restores dueCents=5000
      // (this batch's own prior contribution, unchanged) but
      // computeSettlement now CLAMPS membershipOffsetCents to what's
      // actually available: min(5000, 248) = 248 — far below the
      // restored due, and far below its own VAT component (833). Before
      // this fix, membershipOffsetVatCents would have been hard-returned
      // as the FULL 833 regardless — a VAT portion LARGER than the
      // clamped offset itself (833 > 248), corrupting the membership
      // invoice line, with the gap neither restored to outstandingCents
      // (exempt -> no subscription write at all) nor carried anywhere.
      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { bagFeeCentsOverride: 4000 },
      });
      const now3 = new Date("2026-08-04T02:00:00.000Z");
      const exemptClamped = await batchBuilder.recomputeBatch(batch.id, now3);

      expect(exemptClamped.bagFeeCents).toBe(4000);
      expect(exemptClamped.bagFeeVatCents).toBe(800);
      expect(exemptClamped.withholdingCents).toBe(3);
      expect(exemptClamped.membershipOffsetCents).toBe(248); // clamped down from 5000
      // The critical assertion: VAT proportional to what was ACTUALLY
      // applied (round(248*833/5000)=41), not the full original 833 —
      // and, as a direct consequence, no longer larger than the offset
      // itself.
      expect(exemptClamped.membershipOffsetVatCents).toBe(41);
      expect(exemptClamped.membershipOffsetVatCents).toBeLessThan(
        exemptClamped.membershipOffsetCents,
      );
      expect(exemptClamped.netPayoutCents).toBe(0); // 248 available, all 248 offset

      // [Fix round #4 — the NET half of the same defect] Round #3 fixed
      // the VAT proportion above and left the net residual behind: the
      // batch RELEASED 5000-248=4752 kuruş it had previously collected,
      // and the exempt branch's "write nothing" meant those 4752 were
      // neither withheld by the batch nor returned to the balance —
      // silently forgiven membership revenue. (This assertion used to
      // read `toBe(1000)`; that 1000 WAS the leak.) persistOffset now
      // writes one formula in both branches — stored + batchPrior -
      // applied — so the released amount lands back where it is still
      // owed: 1000 + 5000 - 248 = 5752 net, 167 + 833 - 41 = 959 VAT.
      // Exemption still pauses COLLECTION (the cap fed to
      // computeSettlement is this batch's own prior contribution, never
      // the full balance) and still leaves the lifecycle flags alone.
      const subAfterClamp =
        await prisma.membershipSubscription.findUniqueOrThrow({
          where: { id: sub.id },
        });
      expect(subAfterClamp.outstandingCents).toBe(5752);
      expect(subAfterClamp.outstandingVatCents).toBe(959);
      // Ledger identity for the membership balance: what the subscription
      // still owes plus what every batch has actually collected against
      // it equals the original 6000/1000 — nothing forgiven, nothing
      // double-counted.
      expect(
        subAfterClamp.outstandingCents + exemptClamped.membershipOffsetCents,
      ).toBe(6000);
      expect(
        subAfterClamp.outstandingVatCents +
          exemptClamped.membershipOffsetVatCents,
      ).toBe(1000);
      // Still paused, not collected: the exempt pass must not mark the
      // period paid or promote the subscription's status.
      expect(subAfterClamp.periodPaidAt).toBeNull();
      expect(subAfterClamp.status).toBe("ACTIVE");

      // And it CONVERGES: a further recompute with unchanged inputs is a
      // true no-op on both the batch and the subscription (the released
      // amount is not released a second time).
      const exemptAgain = await batchBuilder.recomputeBatch(
        batch.id,
        new Date("2026-08-05T02:00:00.000Z"),
      );
      expect(exemptAgain.membershipOffsetCents).toBe(248);
      expect(exemptAgain.membershipOffsetVatCents).toBe(41);
      const subAfterSecondClamp =
        await prisma.membershipSubscription.findUniqueOrThrow({
          where: { id: sub.id },
        });
      expect(subAfterSecondClamp.outstandingCents).toBe(5752);
      expect(subAfterSecondClamp.outstandingVatCents).toBe(959);
    }, 30000);

    it("[Fix round #6, I2] a batch from the period that just ended may only RESTORE what it already offset — it can never collect the NEW period's freshly-reset balance out of the old period's gross", async () => {
      const { batchBuilder, renewalCron } = buildHarness(prisma);
      const pricing = new PricingService(prisma as never);
      // bagFeeCentsOverride: 0 — isolates the membership arithmetic from
      // the bag fee, same technique as the tests above.
      const merchant = await seedMerchant(prisma, { bagFeeCentsOverride: 0 });
      merchantIds.push(merchant.id);
      const store = await seedStore(prisma, merchant.id);
      const bagTemplate = await seedBagTemplate(prisma, store.id, 20000);
      const offer = await seedOffer(prisma, bagTemplate.id, store.id, 10);

      // Period 1 runs to 2026-06-01 and owes 600 (500 net + 100 VAT).
      const sub = await prisma.membershipSubscription.create({
        data: {
          merchantId: merchant.id,
          anchorDate: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
          priceCents: 500,
          vatCents: 100,
          status: "ACTIVE",
          outstandingCents: 600,
          outstandingVatCents: 100,
        },
      });

      // A redemption INSIDE period 1 (2026-05-30). gross 20000, no bag
      // fee, withholding round(20000*1%) = 200 -> available 19800, which
      // comfortably clears the whole 600 membership balance.
      await seedRedeemedPaidReservation(prisma, {
        storeId: store.id,
        offerId: offer.id,
        qty: 1,
        unitPriceCents: 20000,
        redeemedAt: new Date("2026-05-30T11:00:00.000Z"),
      });
      await batchBuilder.runNightlyCycle(new Date("2026-05-31T02:00:00.000Z"));
      const batch = await prisma.settlementBatch.findFirstOrThrow({
        where: { merchantId: merchant.id },
      });
      expect(batch.membershipOffsetCents).toBe(600);
      expect(batch.membershipOffsetVatCents).toBe(100);
      expect(batch.netPayoutCents).toBe(19200); // 20000 - 200 - 600
      expect(batch.status).toBe("CALCULATED"); // still open, still recomputable
      const paidPeriod1 = await prisma.membershipSubscription.findUniqueOrThrow(
        {
          where: { id: sub.id },
        },
      );
      expect(paidPeriod1.outstandingCents).toBe(0);

      // The anniversary passes and renewal opens period 2 with a fresh,
      // full balance — nothing carried, per the P1 forgiveness policy.
      await renewalCron.runOnce(new Date("2026-06-02T03:00:00.000Z"));
      const period2 = await prisma.membershipSubscription.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(period2.currentPeriodStart.toISOString()).toBe(
        "2026-06-01T00:00:00.000Z",
      );
      const newPricing = await pricing.resolvePlatformPricing(
        prisma as never,
        period2.currentPeriodStart,
      );
      const period2Due =
        newPricing.membershipAnnualCents +
        Math.round((newPricing.membershipAnnualCents * 20) / 100);
      expect(period2.outstandingCents).toBe(period2Due);

      // Now the period-1 batch is recomputed — the ordinary path: an
      // admin approving it does exactly this (a pre-lock recompute), as
      // does a retry or a very-late line. Its periodStart (2026-05-30)
      // is BEFORE the subscription's current period, so it may only
      // restore its own 600.
      const recomputed = await batchBuilder.recomputeBatch(
        batch.id,
        new Date("2026-06-03T02:00:00.000Z"),
      );

      // Without the guard, lockAndResolveDue returned
      // `sub.outstandingCents (period 2's full price) + 600` as this
      // batch's due, computeSettlement clamped that to the 19800 this
      // batch had available, and the merchant paid a large slice of YEAR
      // TWO's membership fee out of a YEAR ONE payout that had already
      // settled year one's fee in full.
      expect(recomputed.membershipOffsetCents).toBe(600);
      expect(recomputed.membershipOffsetVatCents).toBe(100);
      expect(recomputed.netPayoutCents).toBe(19200);

      const afterRecompute =
        await prisma.membershipSubscription.findUniqueOrThrow({
          where: { id: sub.id },
        });
      // Period 2's balance is untouched — not reduced by the old batch,
      // and not marked paid or re-activated on its behalf either.
      expect(afterRecompute.outstandingCents).toBe(period2Due);
      expect(afterRecompute.outstandingVatCents).toBe(
        period2.outstandingVatCents,
      );
      expect(afterRecompute.periodPaidAt).toBeNull();
      expect(afterRecompute.currentPeriodStart.toISOString()).toBe(
        "2026-06-01T00:00:00.000Z",
      );

      // ...and it converges: recomputing again changes nothing further.
      const again = await batchBuilder.recomputeBatch(
        batch.id,
        new Date("2026-06-04T02:00:00.000Z"),
      );
      expect(again.membershipOffsetCents).toBe(600);
      expect(again.netPayoutCents).toBe(19200);
      expect(
        (
          await prisma.membershipSubscription.findUniqueOrThrow({
            where: { id: sub.id },
          })
        ).outstandingCents,
      ).toBe(period2Due);
    }, 30000);
  },
);
