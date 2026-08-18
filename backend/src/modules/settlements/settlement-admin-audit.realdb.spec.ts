import { PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { OutboxService } from "../outbox/outbox.service";
import { MembershipOffsetService } from "../memberships/membership-offset.service";
import { PublicHolidayService } from "./public-holiday.service";
import { PricingService } from "./pricing.service";
import { SettlementBatchBuilderService } from "./settlement-batch-builder.service";
import { SettlementPayoutService } from "./settlement-payout.service";
import { SettlementsService } from "./settlements.service";
import { AdminSettlementsController } from "./admin-settlements.controller";
import { AdminPricingController } from "./admin-pricing.controller";

/**
 * [Fix round #6, I5] Every money-moving admin action records WHO did it.
 *
 * Settlements and pricing were the only admin mutations in the codebase
 * with no AuditLog row (complaints, offers, merchants, moderation,
 * memberships, stores and ratings all write one) — while `approve` is
 * exactly what the payout cron picks up to transfer money to a merchant's
 * IBAN, and `schedule` changes the per-bag fee for every merchant on the
 * platform.
 *
 * Real DB rather than mocks because the point of the fix is that the
 * state change and its audit row COMMIT TOGETHER; a mocked $transaction
 * would assert the call, not the atomicity. Rows are scoped to this
 * file's own merchant/batch ids and cleaned up by id.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "settlement-admin-audit-realdb";
const ADMIN_ID = `${TAG}-admin-42`;

d("Settlement/pricing admin actions — the acting admin is recorded", () => {
  let prisma: PrismaClient;
  let merchantId: string;
  let settlements: SettlementsService;
  let pricing: PricingService;
  const pricingIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    const holidays = new PublicHolidayService(prisma as never);
    pricing = new PricingService(prisma as never);
    const batchBuilder = new SettlementBatchBuilderService(
      prisma as never,
      holidays,
      pricing,
      new MembershipOffsetService(),
    );
    const registry = new PaymentProviderRegistry();
    const config = {
      get: (key: string) =>
        ({ PAYMENT_PROVIDER: "mock", WEBHOOK_SECRET: `${TAG}-secret` })[key],
    } as unknown as ConfigService;
    const provider = new MockPaymentProvider(config, registry);
    provider.onModuleInit();
    const payout = new SettlementPayoutService(
      prisma as never,
      new PaymentsFacadeService(registry, config),
      new OutboxService(),
      holidays,
      { trySend: async () => true } as never,
    );
    settlements = new SettlementsService(prisma as never, batchBuilder, payout);

    const merchant = await prisma.merchant.create({
      data: {
        legalName: "Realdb Admin Audit Test A.S.",
        tradeName: "Realdb Admin Audit",
        taxId: `${TAG}-${Date.now()}`,
        iban: "TR000006701000000000000002",
        verificationStatus: "APPROVED",
      },
    });
    merchantId = merchant.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const batches = await prisma.settlementBatch.findMany({
      where: { merchantId },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: {
        entity: "SettlementBatch",
        entityId: { in: batches.map((b) => b.id) },
      },
    });
    await prisma.auditLog.deleteMany({
      where: { entity: "PlatformPricing", entityId: { in: pricingIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { actorId: ADMIN_ID, entity: "SettlementCycle" },
    });
    await prisma.settlementBatch.deleteMany({ where: { merchantId } });
    await prisma.platformPricing.deleteMany({
      where: { id: { in: pricingIds } },
    });
    await prisma.merchant.delete({ where: { id: merchantId } });
    await prisma.$disconnect();
  });

  const seedBatch = async (day: string, status: "CALCULATED" | "HELD") => {
    const periodStart = new Date(`${day}T00:00:00.000Z`);
    return prisma.settlementBatch.create({
      data: {
        merchantId,
        periodStart,
        periodEnd: new Date(periodStart.getTime() + 24 * 60 * 60 * 1000),
        status,
        dueAt: new Date(periodStart.getTime() + 5 * 24 * 60 * 60 * 1000),
      },
    });
  };

  const auditFor = (entityId: string) =>
    prisma.auditLog.findMany({
      where: { entityId },
      orderBy: { createdAt: "asc" },
    });

  it("approve records settlement.approved with the acting admin, in the same transaction as the status flip", async () => {
    const batch = await seedBatch("2026-07-01", "CALCULATED");
    const approved = await settlements.adminApprove(
      batch.id,
      ADMIN_ID,
      new Date("2026-07-06T09:00:00.000Z"),
    );
    expect(approved.status).toBe("APPROVED");

    const rows = await auditFor(batch.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorType: "ADMIN",
      actorId: ADMIN_ID,
      action: "settlement.approved",
      entity: "SettlementBatch",
    });
    expect(rows[0].diffJson).toMatchObject({
      toStatus: "APPROVED",
      merchantId,
    });
  });

  it("hold records settlement.held with the admin's own note, and a REFUSED hold records nothing", async () => {
    const batch = await seedBatch("2026-07-02", "CALCULATED");
    await settlements.adminHold(batch.id, "  fraud review  ", ADMIN_ID);
    const rows = await auditFor(batch.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorType: "ADMIN",
      actorId: ADMIN_ID,
      action: "settlement.held",
    });
    expect(rows[0].diffJson).toMatchObject({ holdReason: "fraud review" });

    // A hold that the guard refuses must not leave an audit row claiming
    // it happened — the write and the record share one transaction in
    // both directions.
    const sent = await prisma.settlementBatch.create({
      data: {
        merchantId,
        periodStart: new Date("2026-07-03T00:00:00.000Z"),
        periodEnd: new Date("2026-07-04T00:00:00.000Z"),
        status: "SENT",
        sentAt: new Date("2026-07-04T00:00:00.000Z"),
      },
    });
    await expect(
      settlements.adminHold(sent.id, "too late", ADMIN_ID),
    ).rejects.toThrow();
    expect(await auditFor(sent.id)).toHaveLength(0);
  });

  it("retry records settlement.retried, and run-nightly records settlement.nightly_run for the cycle", async () => {
    const batch = await seedBatch("2026-07-05", "HELD");
    await settlements.adminRetry(
      batch.id,
      ADMIN_ID,
      new Date("2026-07-10T09:00:00.000Z"),
    );
    const rows = await auditFor(batch.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorType: "ADMIN",
      actorId: ADMIN_ID,
      action: "settlement.retried",
    });

    await settlements.adminRunNightlyCycle(
      ADMIN_ID,
      new Date("2026-07-11T02:00:00.000Z"),
    );
    const cycleRows = await prisma.auditLog.findMany({
      where: { actorId: ADMIN_ID, entity: "SettlementCycle" },
    });
    expect(cycleRows).toHaveLength(1);
    expect(cycleRows[0]).toMatchObject({
      actorType: "ADMIN",
      action: "settlement.nightly_run",
      entityId: "2026-07-11",
    });
  });

  it("scheduling platform pricing records pricing.scheduled with the acting admin", async () => {
    const effectiveFrom = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const created = await pricing.scheduleFuturePricing(
      { bagFeeCents: 3333, membershipAnnualCents: 251000, effectiveFrom },
      ADMIN_ID,
    );
    pricingIds.push(created.id);

    const rows = await auditFor(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorType: "ADMIN",
      actorId: ADMIN_ID,
      action: "pricing.scheduled",
      entity: "PlatformPricing",
    });
    expect(rows[0].diffJson).toMatchObject({ bagFeeCents: 3333 });
  });

  it("the admin controllers bind the acting admin and pass it through in the right position", async () => {
    const calls: unknown[][] = [];
    const fakeSettlements = {
      adminRunNightlyCycle: (...args: unknown[]) => {
        calls.push(["runNightly", ...args]);
        return Promise.resolve({});
      },
      adminApprove: (...args: unknown[]) => {
        calls.push(["approve", ...args]);
        return Promise.resolve({});
      },
      adminHold: (...args: unknown[]) => {
        calls.push(["hold", ...args]);
        return Promise.resolve({});
      },
      adminRetry: (...args: unknown[]) => {
        calls.push(["retry", ...args]);
        return Promise.resolve({});
      },
    };
    const controller = new AdminSettlementsController(fakeSettlements as never);
    await controller.runNightly("admin-9");
    await controller.approve("admin-9", "batch-1");
    await controller.hold("admin-9", "batch-1", { note: "n" } as never);
    await controller.retry("admin-9", "batch-1");

    // Argument ORDER is the failure mode a service-level test cannot see:
    // both the batch id and the admin id are strings, so a swap type-checks
    // and would file every action under a batch id as its actor.
    expect(calls).toEqual([
      ["runNightly", "admin-9"],
      ["approve", "batch-1", "admin-9"],
      ["hold", "batch-1", "n", "admin-9"],
      ["retry", "batch-1", "admin-9"],
    ]);

    const pricingCalls: unknown[][] = [];
    const fakePricing = {
      scheduleFuturePricing: (...args: unknown[]) => {
        pricingCalls.push(args);
        return Promise.resolve({});
      },
    };
    const pricingController = new AdminPricingController(fakePricing as never);
    const dto = {
      bagFeeCents: 1,
      membershipAnnualCents: 2,
      effectiveFrom: new Date(),
    };
    await pricingController.schedule("admin-9", dto as never);
    expect(pricingCalls).toEqual([[dto, "admin-9"]]);
  });
});
