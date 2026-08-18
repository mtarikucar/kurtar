import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { AdminExportsService } from "./admin-exports.service";
import { PaymentProviderRegistry } from "../payments-core/payment-provider.registry";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { MockPaymentProvider } from "../payments-core/adapters/mock-payment-provider";
import { OutboxService } from "../outbox/outbox.service";
import { MembershipOffsetService } from "../memberships/membership-offset.service";
import { PublicHolidayService } from "../settlements/public-holiday.service";
import { PricingService } from "../settlements/pricing.service";
import { SettlementBatchBuilderService } from "../settlements/settlement-batch-builder.service";
import { SettlementPayoutService } from "../settlements/settlement-payout.service";
import { SettlementsService } from "../settlements/settlements.service";

/**
 * [Cross-lane fix, I14] Bank/tax identity is read on THREE admin
 * surfaces. Exactly one of them — MerchantsService.adminGetDetail —
 * recorded who read it. The other two (the settlement detail, and the
 * merchants CSV export, which is every merchant's taxId and full IBAN in
 * one file) left no trace at all, which under KVKK is the gap.
 *
 * This suite pins the invariant on both of the surfaces that lacked it,
 * and the narrowed select the export should have had all along.
 *
 * Real DB because the point is that the audit row COMMITS — a mocked
 * $transaction would assert the call, not the commit. Every row is
 * scoped to this suite's own merchant id and deleted by it.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "admin-pii-audit-realdb";
const ADMIN_ID = `${TAG}-admin-7`;
const IBAN = "TR000006701000000000000042";

/** A minimal Express-shaped sink: streamCsv only ever calls setHeader/
 * write/end/destroy. */
function fakeResponse() {
  const chunks: string[] = [];
  let ended = false;
  const res = {
    setHeader: () => undefined,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
    end: () => {
      ended = true;
    },
    destroy: (err?: Error) => {
      throw err ?? new Error("destroyed");
    },
  } as unknown as Response;
  return { res, body: () => chunks.join(""), isEnded: () => ended };
}

d("admin surfaces that expose IBAN/taxId — audit parity", () => {
  let prisma: PrismaClient;
  let exportsService: AdminExportsService;
  let settlements: SettlementsService;
  let merchantId: string;
  let taxId: string;
  let batchId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    exportsService = new AdminExportsService(prisma as never);

    const holidays = new PublicHolidayService(prisma as never);
    const pricing = new PricingService(prisma as never);
    const registry = new PaymentProviderRegistry();
    const config = {
      get: (key: string) =>
        ({ PAYMENT_PROVIDER: "mock", WEBHOOK_SECRET: `${TAG}-secret` })[key],
    } as unknown as ConfigService;
    const provider = new MockPaymentProvider(config, registry);
    provider.onModuleInit();
    settlements = new SettlementsService(
      prisma as never,
      new SettlementBatchBuilderService(
        prisma as never,
        holidays,
        pricing,
        new MembershipOffsetService(),
      ),
      new SettlementPayoutService(
        prisma as never,
        new PaymentsFacadeService(registry, config),
        new OutboxService(),
        holidays,
        { trySend: async () => true } as never,
      ),
    );

    taxId = `${TAG}-${Date.now()}`;
    const merchant = await prisma.merchant.create({
      data: {
        legalName: "PII Audit Test A.S.",
        tradeName: "PII Audit Test",
        taxId,
        iban: IBAN,
        verificationStatus: "APPROVED",
      },
    });
    merchantId = merchant.id;
    const periodStart = new Date("2027-03-01T00:00:00.000Z");
    const batch = await prisma.settlementBatch.create({
      data: {
        merchantId,
        periodStart,
        periodEnd: new Date(periodStart.getTime() + 86_400_000),
        status: "CALCULATED",
      },
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.auditLog.deleteMany({ where: { actorId: ADMIN_ID } });
    await prisma.settlementBatch.deleteMany({ where: { merchantId } });
    await prisma.merchant.delete({ where: { id: merchantId } });
    await prisma.$disconnect();
  });

  const auditRows = (action: string) =>
    prisma.auditLog.findMany({
      where: { actorId: ADMIN_ID, action },
      orderBy: { createdAt: "asc" },
    });

  it("the settlement detail read — which returns the merchant's full IBAN — writes an audit row", async () => {
    const before = await auditRows("merchant.bank_details.viewed");
    const batch = await settlements.adminGet(batchId, ADMIN_ID);
    // The material really is in the response — this is what makes the
    // audit row necessary rather than decorative.
    expect(batch.merchant.iban).toBe(IBAN);

    const after = await auditRows("merchant.bank_details.viewed");
    expect(after.length).toBe(before.length + 1);
    expect(after[after.length - 1]).toMatchObject({
      actorType: "ADMIN",
      actorId: ADMIN_ID,
      entity: "Merchant",
      entityId: merchantId,
    });
    expect(after[after.length - 1].diffJson).toMatchObject({
      via: "settlement.detail",
      batchId,
    });
  });

  it("a settlement detail read that 404s writes nothing — the row and the read share one transaction", async () => {
    const before = await auditRows("merchant.bank_details.viewed");
    await expect(
      settlements.adminGet(`${TAG}-no-such-batch`, ADMIN_ID),
    ).rejects.toThrow();
    const after = await auditRows("merchant.bank_details.viewed");
    expect(after.length).toBe(before.length);
  });

  it("the merchants CSV export writes merchant.kyc.exported BEFORE streaming, carrying the requested range", async () => {
    const { res, body, isEnded } = fakeResponse();
    await exportsService.streamMerchantsCsv(
      res,
      { from: "2020-01-01T00:00:00.000Z" },
      ADMIN_ID,
    );
    expect(isEnded()).toBe(true);
    // The export really does carry taxId and full IBAN.
    expect(body()).toContain(taxId);
    expect(body()).toContain(IBAN);

    const rows = await auditRows("merchant.kyc.exported");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorType: "ADMIN",
      actorId: ADMIN_ID,
      entity: "Merchant",
      entityId: "*",
    });
    expect(rows[0].diffJson).toMatchObject({
      from: "2020-01-01T00:00:00.000Z",
      to: null,
    });
  });

  it("the merchants CSV export selects only the eight columns it emits — not every Merchant column", async () => {
    const spy = jest.spyOn(prisma.merchant, "findMany");
    const { res } = fakeResponse();
    await exportsService.streamMerchantsCsv(res, {}, ADMIN_ID);
    expect(spy).toHaveBeenCalled();
    const args = spy.mock.calls[0][0] as { select?: Record<string, boolean> };
    expect(args.select).toBeDefined();
    expect(Object.keys(args.select!).sort()).toEqual([
      "createdAt",
      "iban",
      "id",
      "legalName",
      "taxId",
      "tradeName",
      "verificationStatus",
      "verifiedAt",
    ]);
    // The columns the export never emits must not even be fetched.
    expect(args.select).not.toHaveProperty("mersisNo");
    expect(args.select).not.toHaveProperty("kepAddress");
    spy.mockRestore();
  });
});
