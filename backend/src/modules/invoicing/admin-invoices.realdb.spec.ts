import { ConfigService } from "@nestjs/config";
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { CommissionInvoiceService } from "./commission-invoice.service";
import { EDocumentFacadeService } from "./e-document-facade.service";
import { EDocumentProviderRegistry } from "./e-document-provider.registry";
import { MockEDocumentProvider } from "./adapters/mock-e-document-provider";

/**
 * [Cross-lane fix, M16] A commission e-invoice that fails issuance stays
 * DRAFT with a real tax obligation behind it. The outbox retries it and a
 * daily sweep emails ops — but nothing in the PRODUCT could see the stuck
 * row or act on it: no endpoint listed invoices at all, and the only
 * recovery was to wait for a retry ladder already exhausted.
 *
 * This suite pins the two halves of that visibility: the DRAFT queue read
 * and the admin re-issue action, including the property that makes the
 * action safe to expose — a re-issue reuses the SAME invoice id, which
 * the provider contract dedupes, so it can never mint a second e-fatura.
 *
 * Real DB so the update and its AuditLog row are proved to COMMIT
 * together. Scoped to this suite's own merchant.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "admin-invoices-realdb";
const ADMIN_ID = `${TAG}-admin-1`;

d("admin commission-invoice queue", () => {
  let prisma: PrismaClient;
  let service: CommissionInvoiceService;
  let provider: MockEDocumentProvider;
  let merchantId: string;
  let batchId: string;
  let invoiceCounter = 0;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    const registry = new EDocumentProviderRegistry();
    provider = new MockEDocumentProvider(registry);
    provider.onModuleInit();
    const config = {
      get: (key: string) => ({ EDOC_PROVIDER: "mock" })[key],
    } as unknown as ConfigService;
    service = new CommissionInvoiceService(
      prisma as never,
      new EDocumentFacadeService(registry, config),
      { checkIsEFaturaUser: async () => false } as never,
      { trySend: async () => true } as never,
    );

    const merchant = await prisma.merchant.create({
      data: {
        legalName: "Admin Invoice Queue Test A.S.",
        tradeName: "Admin Invoice Queue Test",
        taxId: "1234567890", // a VALID 10-digit VKN — re-issue requires it
        iban: "TR000006701000000000000002",
        verificationStatus: "APPROVED",
      },
    });
    merchantId = merchant.id;
    const periodStart = new Date("2027-06-01T00:00:00.000Z");
    const batch = await prisma.settlementBatch.create({
      data: {
        merchantId,
        periodStart,
        periodEnd: new Date(periodStart.getTime() + 86_400_000),
        status: "SENT",
      },
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const invoices = await prisma.commissionInvoice.findMany({
      where: { merchantId },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: {
        entity: "CommissionInvoice",
        entityId: { in: invoices.map((i) => i.id) },
      },
    });
    await prisma.commissionInvoice.deleteMany({ where: { merchantId } });
    await prisma.settlementBatch.deleteMany({ where: { merchantId } });
    await prisma.merchant.delete({ where: { id: merchantId } });
    await prisma.$disconnect();
  });

  /** A standalone invoice row (batchId null for all but the first, so the
   * (batchId, type) unique index cannot collide across cases). */
  async function seedInvoice(
    status: "DRAFT" | "SENT",
    opts: { withBatch?: boolean } = {},
  ) {
    invoiceCounter += 1;
    return prisma.commissionInvoice.create({
      data: {
        merchantId,
        batchId: opts.withBatch ? batchId : null,
        type: invoiceCounter % 2 === 0 ? "BAG_FEE" : "MEMBERSHIP",
        docType: "EARSIVFATURA",
        status,
        netAmountCents: 1000,
        vatCents: 200,
        totalAmountCents: 1200,
        linesJson: [
          {
            description: `Test satır ${invoiceCounter}`,
            amountCents: 1000,
            vatCents: 200,
          },
        ],
        ...(status === "SENT"
          ? {
              issuedAt: new Date(),
              nilveraDocId: `${TAG}-doc-${invoiceCounter}`,
            }
          : {}),
      },
    });
  }

  it("the DRAFT queue lists stuck invoices oldest-first with the merchant's trade name, and excludes issued ones", async () => {
    const stuck = await seedInvoice("DRAFT", { withBatch: true });
    const issued = await seedInvoice("SENT");

    const page = await service.adminList("DRAFT", merchantId, 1, 50);
    const ids = page.items.map((i) => i.id);
    expect(ids).toContain(stuck.id);
    expect(ids).not.toContain(issued.id);
    expect(page.total).toBe(1);

    const row = page.items.find((i) => i.id === stuck.id)!;
    expect(row.merchantTradeName).toBe("Admin Invoice Queue Test");
    expect(row.batchId).toBe(batchId);
    expect(row.totalAmountCents).toBe(1200);
    // The itemized UBL payload is never in a list response.
    expect(row).not.toHaveProperty("linesJson");
  });

  it("re-issuing a DRAFT invoice records the provider document and the acting admin, in one transaction", async () => {
    const invoice = await seedInvoice("DRAFT");
    const result = await service.adminReissue(invoice.id, ADMIN_ID);

    expect(result.status).toBe("SENT");
    expect(result.nilveraDocId).toBeTruthy();
    expect(result.issuedAt).not.toBeNull();

    const stored = await prisma.commissionInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(stored.status).toBe("SENT");
    expect(stored.nilveraDocId).toBe(result.nilveraDocId);

    const audit = await prisma.auditLog.findMany({
      where: { entityId: invoice.id, action: "invoice.reissued" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorType: "ADMIN", actorId: ADMIN_ID });
    expect(audit[0].diffJson).toMatchObject({
      merchantId,
      nilveraDocId: result.nilveraDocId,
    });
  });

  it("re-issue passes the SAME invoice id to the provider, so a double click cannot mint a second e-fatura", async () => {
    const invoice = await seedInvoice("DRAFT");
    const first = await service.adminReissue(invoice.id, ADMIN_ID);

    // The provider was called with the invoice's OWN id as the
    // idempotency key — the contract every adapter must dedupe on.
    expect(provider.getIssuedLog().has(invoice.id)).toBe(true);
    expect(provider.getIssuedLog().get(invoice.id)!.docId).toBe(
      first.nilveraDocId,
    );

    // ...and the already-SENT row is refused outright on the second
    // attempt, before the provider is touched at all.
    const err = await service
      .adminReissue(invoice.id, ADMIN_ID)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      errorCode: "COMMISSION_INVOICE_NOT_REISSUABLE",
    });
    expect(provider.getIssuedLog().size).toBeGreaterThan(0);
  });

  it("a provider refusal leaves the row DRAFT with no audit row, and surfaces a distinct error code", async () => {
    const invoice = await seedInvoice("DRAFT");
    const spy = jest
      .spyOn(provider, "issue")
      .mockRejectedValueOnce(new Error("nilvera down"));

    const err = await service
      .adminReissue(invoice.id, ADMIN_ID)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
      errorCode: "COMMISSION_INVOICE_ISSUE_FAILED",
    });

    const stored = await prisma.commissionInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(stored.status).toBe("DRAFT");
    expect(stored.nilveraDocId).toBeNull();
    expect(
      await prisma.auditLog.findMany({
        where: { entityId: invoice.id, action: "invoice.reissued" },
      }),
    ).toHaveLength(0);
    spy.mockRestore();
  });

  it("re-issuing an invoice that does not exist is a 404, not a silent no-op", async () => {
    await expect(
      service.adminReissue(`${TAG}-nope`, ADMIN_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
