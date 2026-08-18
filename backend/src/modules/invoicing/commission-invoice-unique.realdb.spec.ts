import { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";

/**
 * [Fix round #6, C2] The storage half of commission-invoice idempotency,
 * proved against the real database rather than a mock.
 *
 * CommissionInvoiceService's own unit spec proves the SERVICE reuses an
 * existing row; this proves the DATABASE would refuse a second one even
 * if some future writer forgot to ask — which is the only thing standing
 * between an at-least-once outbox and a second legally-issued e-fatura
 * for the same settlement batch. It also pins the migration itself
 * (20260818090000_commission_invoice_batch_type_unique): without it
 * applied, the duplicate insert below simply succeeds.
 *
 * Every row is scoped to this file's own tag and cleaned up by id in
 * afterAll — never a table-wide deleteMany (this database is shared with
 * concurrently-running spec files).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "commission-invoice-unique-realdb";

d(
  "CommissionInvoice — one invoice per (batch, type), enforced by Postgres",
  () => {
    let prisma: PrismaClient;
    let merchantId: string;
    let batchId: string;
    let otherBatchId: string;

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL } },
      });
      await prisma.$connect();

      const merchant = await prisma.merchant.create({
        data: {
          legalName: "Realdb Invoice Unique Test A.S.",
          tradeName: "Realdb Invoice Unique",
          taxId: `${TAG}-${Date.now()}`,
          iban: "TR000006701000000000000002",
          verificationStatus: "APPROVED",
        },
      });
      merchantId = merchant.id;

      const periodStart = new Date("2026-08-01T00:00:00.000Z");
      const batch = await prisma.settlementBatch.create({
        data: {
          merchantId,
          periodStart,
          periodEnd: new Date(periodStart.getTime() + 24 * 60 * 60 * 1000),
          status: "SENT",
        },
      });
      batchId = batch.id;
      const otherBatch = await prisma.settlementBatch.create({
        data: {
          merchantId,
          periodStart: new Date("2026-08-02T00:00:00.000Z"),
          periodEnd: new Date("2026-08-03T00:00:00.000Z"),
          status: "SENT",
        },
      });
      otherBatchId = otherBatch.id;
    });

    afterAll(async () => {
      if (!prisma) return;
      await prisma.commissionInvoice.deleteMany({ where: { merchantId } });
      await prisma.settlementBatch.deleteMany({ where: { merchantId } });
      await prisma.merchant.delete({ where: { id: merchantId } });
      await prisma.$disconnect();
    });

    const draft = (batch: string, type: "BAG_FEE" | "MEMBERSHIP") => ({
      merchantId,
      batchId: batch,
      type,
      docType: "EARSIVFATURA" as const,
      status: "DRAFT" as const,
      netAmountCents: 2500,
      vatCents: 500,
      totalAmountCents: 3000,
    });

    it("refuses a SECOND invoice of the same type for the same batch, but allows the other type and the same type on another batch", async () => {
      await prisma.commissionInvoice.create({
        data: draft(batchId, "BAG_FEE"),
      });

      // The duplicate a redelivered outbox event used to create.
      const duplicate = await prisma.commissionInvoice
        .create({ data: draft(batchId, "BAG_FEE") })
        .then(
          () => null,
          (err: unknown) => err,
        );
      expect(duplicate).not.toBeNull();
      expect(isUniqueConstraintViolation(duplicate)).toBe(true);

      // ...while the two legitimate shapes are untouched: a MEMBERSHIP
      // invoice for the SAME batch, and a BAG_FEE invoice for another one.
      await prisma.commissionInvoice.create({
        data: draft(batchId, "MEMBERSHIP"),
      });
      await prisma.commissionInvoice.create({
        data: draft(otherBatchId, "BAG_FEE"),
      });

      expect(
        await prisma.commissionInvoice.count({ where: { merchantId } }),
      ).toBe(3);
    });
  },
);
