import { ConfigService } from "@nestjs/config";
import { ConflictException } from "@nestjs/common";
import { PrismaClient, SettlementStatus } from "@prisma/client";
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
import {
  SETTLEMENT_TRANSITIONS,
  allowedFromStatusesFor,
} from "./settlement-transitions";

/**
 * [Cross-lane fix, M3] "The money actually arrived" is now recordable.
 *
 * A payout reached SENT — the transfer handed to the PSP — and stopped
 * there forever: SENT -> SETTLED was a declared edge in
 * SETTLEMENT_TRANSITIONS with NO writer, so nothing in the system ever
 * recorded arrival, and the daily reconciliation sweep alerted on a state
 * no action could clear.
 *
 * What this suite pins:
 *  - only a SENT batch can be settled, and the guard comes from the
 *    transitions map (every OTHER status is refused, including the ones a
 *    hand-written list would most plausibly have got wrong);
 *  - the status flip, both confirmation columns and the AuditLog row
 *    commit together, and a refused confirmation writes nothing;
 *  - a settled batch drops out of the stale-SENT reconciliation sweep,
 *    which is the whole reason the alert was unclearable.
 *
 * Rows are scoped to this suite's own merchant and deleted by it.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "settlement-settled-realdb";
const ADMIN_ID = `${TAG}-admin-3`;

d("admin SENT -> SETTLED confirmation", () => {
  let prisma: PrismaClient;
  let settlements: SettlementsService;
  let payout: SettlementPayoutService;
  let merchantId: string;
  let dayCounter = 0;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    const holidays = new PublicHolidayService(prisma as never);
    const pricing = new PricingService(prisma as never);
    const registry = new PaymentProviderRegistry();
    const config = {
      get: (key: string) =>
        ({ PAYMENT_PROVIDER: "mock", WEBHOOK_SECRET: `${TAG}-secret` })[key],
    } as unknown as ConfigService;
    const provider = new MockPaymentProvider(config, registry);
    provider.onModuleInit();
    payout = new SettlementPayoutService(
      prisma as never,
      new PaymentsFacadeService(registry, config),
      new OutboxService(),
      holidays,
      { trySend: async () => true } as never,
    );
    settlements = new SettlementsService(
      prisma as never,
      new SettlementBatchBuilderService(
        prisma as never,
        holidays,
        pricing,
        new MembershipOffsetService(),
      ),
      payout,
    );

    const merchant = await prisma.merchant.create({
      data: {
        legalName: "Settled Confirmation Test A.S.",
        tradeName: "Settled Confirmation Test",
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
        entity: { in: ["SettlementBatch", "Merchant"] },
        entityId: { in: [...batches.map((b) => b.id), merchantId] },
      },
    });
    await prisma.settlementBatch.deleteMany({ where: { merchantId } });
    await prisma.merchant.delete({ where: { id: merchantId } });
    await prisma.$disconnect();
  });

  async function seedBatch(status: SettlementStatus, sentDaysAgo?: number) {
    const periodStart = new Date(Date.UTC(2027, 4, 1 + dayCounter++));
    return prisma.settlementBatch.create({
      data: {
        merchantId,
        periodStart,
        periodEnd: new Date(periodStart.getTime() + 86_400_000),
        status,
        netPayoutCents: 12_345,
        ...(sentDaysAgo === undefined
          ? {}
          : {
              sentAt: new Date(Date.now() - sentDaysAgo * 86_400_000),
              pspTransferRef: `${TAG}-ref-${dayCounter}`,
            }),
      },
    });
  }

  const settleAudit = (batchId: string) =>
    prisma.auditLog.findMany({
      where: { entityId: batchId, action: "settlement.settled" },
    });

  it("a SENT batch becomes SETTLED, stamping settledAt + the bank reference, with the audit row in the same transaction", async () => {
    const batch = await seedBatch("SENT", 4);
    const result = await settlements.adminMarkSettled(
      batch.id,
      "  DEKONT-2027-0042  ",
      ADMIN_ID,
      new Date("2027-05-20T09:30:00.000Z"),
    );

    expect(result.status).toBe("SETTLED");
    expect(result.settledAt?.toISOString()).toBe("2027-05-20T09:30:00.000Z");
    // Trimmed, exactly like adminHold's note.
    expect(result.settlementReference).toBe("DEKONT-2027-0042");

    const rows = await settleAudit(batch.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorType: "ADMIN",
      actorId: ADMIN_ID,
      entity: "SettlementBatch",
    });
    expect(rows[0].diffJson).toMatchObject({
      toStatus: "SETTLED",
      merchantId,
      netPayoutCents: 12_345,
      settlementReference: "DEKONT-2027-0042",
    });
  });

  it("confirming without a reference still records the arrival (reference stays null)", async () => {
    const batch = await seedBatch("SENT", 4);
    const result = await settlements.adminMarkSettled(
      batch.id,
      "   ",
      ADMIN_ID,
    );
    expect(result.status).toBe("SETTLED");
    expect(result.settlementReference).toBeNull();
    expect(result.settledAt).not.toBeNull();
  });

  it("every status the transitions map does NOT allow into SETTLED is refused, and writes nothing", async () => {
    const allowed = allowedFromStatusesFor("SETTLED");
    expect(allowed).toEqual(["SENT"]);

    const refusable = (
      Object.keys(SETTLEMENT_TRANSITIONS) as SettlementStatus[]
    )
      .filter((s) => !allowed.includes(s))
      // PENDING is never persisted by any writer in this codebase, but it
      // is a real enum value and the guard must refuse it too.
      .sort();

    for (const status of refusable) {
      const batch = await seedBatch(status);
      const err = await settlements
        .adminMarkSettled(batch.id, "should-not-apply", ADMIN_ID)
        .then(() => null)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        statusCode: 409,
        errorCode: "SETTLEMENT_NOT_SETTLEABLE",
      });

      const after = await prisma.settlementBatch.findUniqueOrThrow({
        where: { id: batch.id },
      });
      expect(after.status).toBe(status);
      expect(after.settledAt).toBeNull();
      expect(after.settlementReference).toBeNull();
      expect(await settleAudit(batch.id)).toHaveLength(0);
    }
  });

  it("a settled batch drops out of the stale-SENT reconciliation sweep — the alert set finally drains", async () => {
    const stale = await seedBatch("SENT", 10);
    const settled = await seedBatch("SENT", 10);
    await settlements.adminMarkSettled(settled.id, "DEKONT-9", ADMIN_ID);

    await payout.reconcileStuckBatches(new Date());

    // Scoped to this suite's own two rows — never a table-wide count.
    const [staleRow, settledRow] = await Promise.all([
      prisma.settlementBatch.findUniqueOrThrow({ where: { id: stale.id } }),
      prisma.settlementBatch.findUniqueOrThrow({ where: { id: settled.id } }),
    ]);
    expect(staleRow.reconciliationAlertSentAt).not.toBeNull();
    expect(settledRow.reconciliationAlertSentAt).toBeNull();
  });
});
