import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CommissionInvoiceService } from "./commission-invoice.service";
import { EDocumentFacadeService } from "./e-document-facade.service";
import { TaxpayerLookupService } from "./taxpayer-lookup.service";

interface FakeBatch {
  id: string;
  bagFeeCents: number;
  bagFeeVatCents: number;
  withholdingCents: number;
  membershipOffsetCents: number;
  membershipOffsetVatCents: number;
  merchant: { id: string; taxId: string; legalName: string };
  settlementLines: {
    reservationId: string;
    bagFeeCents: number;
    bagFeeVatCents: number;
  }[];
}

function baseBatch(overrides: Partial<FakeBatch> = {}): FakeBatch {
  return {
    id: "batch1",
    bagFeeCents: 2500,
    bagFeeVatCents: 500,
    withholdingCents: 999999, // deliberately large/arbitrary — see the
    // "withholding is never read" test below.
    membershipOffsetCents: 0,
    membershipOffsetVatCents: 0,
    merchant: { id: "m1", taxId: "1234567890", legalName: "Test Firma A.Ş." },
    settlementLines: [
      { reservationId: "r1", bagFeeCents: 2500, bagFeeVatCents: 500 },
    ],
    ...overrides,
  };
}

/**
 * [Fix round #6, C2] The fake `commissionInvoice` table is now a real
 * little store rather than a create-only recorder: rows persist between
 * calls and `findFirst` resolves them by (batchId, type), so a second
 * `createInvoicesForSentBatch("batch1")` in a test exercises the SAME
 * redelivery path the outbox produces in production. A create-only mock
 * could not have failed on the duplicate-invoice defect at all — it had
 * no notion of a row already existing.
 */
function buildHarness(batch: FakeBatch | null) {
  const createdInvoices: Record<string, unknown>[] = [];
  const rows: Record<string, unknown>[] = [];
  let nextId = 1;
  const matches = (
    row: Record<string, unknown>,
    where: { batchId?: string; type?: string },
  ) => row.batchId === where.batchId && row.type === where.type;

  const prisma = {
    settlementBatch: {
      findUnique: jest.fn().mockResolvedValue(batch),
    },
    commissionInvoice: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: Record<string, string> }) =>
          Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
        ),
      findFirstOrThrow: jest
        .fn()
        .mockImplementation(({ where }: { where: Record<string, string> }) => {
          const found = rows.find((r) => matches(r, where));
          return found
            ? Promise.resolve(found)
            : Promise.reject(new Error("not found"));
        }),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `inv${nextId++}`, nilveraDocId: null, ...data };
          rows.push(row);
          // A SNAPSHOT, not the live row — `createdInvoices` records what
          // was drafted (status DRAFT), while `rows` is the mutable store
          // that `update` writes SENT onto.
          createdInvoices.push({ ...row });
          return Promise.resolve(row);
        }),
      update: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const row = rows.find((r) => r.id === where.id);
            if (row) Object.assign(row, data);
            return Promise.resolve(row ?? {});
          },
        ),
    },
  };

  const facade = {
    issue: jest.fn().mockResolvedValue({ docId: "doc1", status: "issued" }),
  } as unknown as EDocumentFacadeService;

  const taxpayerLookup = {
    checkIsEFaturaUser: jest.fn().mockResolvedValue(null),
  } as unknown as TaxpayerLookupService;

  const opsAlert = { trySend: jest.fn().mockResolvedValue(true) };

  const service = new CommissionInvoiceService(
    prisma as never,
    facade,
    taxpayerLookup,
    opsAlert as never,
  );
  return {
    service,
    prisma,
    facade,
    taxpayerLookup,
    opsAlert,
    createdInvoices,
    rows,
  };
}

describe("CommissionInvoiceService.createInvoicesForSentBatch", () => {
  it("creates a BAG_FEE invoice with the batch's net/vat/total", async () => {
    const { service, createdInvoices } = buildHarness(baseBatch());
    await service.createInvoicesForSentBatch("batch1");

    expect(createdInvoices).toHaveLength(1);
    expect(createdInvoices[0]).toMatchObject({
      type: "BAG_FEE",
      netAmountCents: 2500,
      vatCents: 500,
      totalAmountCents: 3000,
      status: "DRAFT",
    });
  });

  it("creates a SEPARATE MEMBERSHIP invoice when the batch offset any membership balance, with the P2 VAT split", async () => {
    const { service, createdInvoices } = buildHarness(
      baseBatch({
        membershipOffsetCents: 6000,
        membershipOffsetVatCents: 1000,
      }),
    );
    await service.createInvoicesForSentBatch("batch1");

    expect(createdInvoices).toHaveLength(2);
    const membershipInvoice = createdInvoices.find(
      (i) => i.type === "MEMBERSHIP",
    );
    // [reviewer's own example] 6000 total = 5000 net + 1000 vat.
    expect(membershipInvoice).toMatchObject({
      type: "MEMBERSHIP",
      netAmountCents: 5000,
      vatCents: 1000,
      totalAmountCents: 6000,
    });
  });

  it("does NOT create a MEMBERSHIP invoice when nothing was offset this batch", async () => {
    const { service, createdInvoices } = buildHarness(
      baseBatch({ membershipOffsetCents: 0 }),
    );
    await service.createInvoicesForSentBatch("batch1");

    expect(createdInvoices.some((i) => i.type === "MEMBERSHIP")).toBe(false);
  });

  it("does NOT create a BAG_FEE invoice when the batch has none (e.g. a fully-overridden-to-0 merchant)", async () => {
    const { service, createdInvoices } = buildHarness(
      baseBatch({ bagFeeCents: 0, bagFeeVatCents: 0, settlementLines: [] }),
    );
    await service.createInvoicesForSentBatch("batch1");

    expect(createdInvoices.some((i) => i.type === "BAG_FEE")).toBe(false);
  });

  it("[brief-mandated] withholdingCents is NEVER read into either invoice — identical output for wildly different withholding values", async () => {
    const low = buildHarness(
      baseBatch({
        membershipOffsetCents: 6000,
        membershipOffsetVatCents: 1000,
        withholdingCents: 0,
      }),
    );
    await low.service.createInvoicesForSentBatch("batch1");

    const high = buildHarness(
      baseBatch({
        membershipOffsetCents: 6000,
        membershipOffsetVatCents: 1000,
        withholdingCents: 5_000_000, // absurdly large, must have zero effect
      }),
    );
    await high.service.createInvoicesForSentBatch("batch1");

    const strip = (rows: Record<string, unknown>[]) =>
      rows.map((row) => {
        const { id: _id, ...rest } = row;
        return rest;
      });
    expect(strip(low.createdInvoices)).toEqual(strip(high.createdInvoices));
  });

  it("skips entirely (no invoice, no provider call) for an invalid merchant taxId, and raises an ops alert instead of only logging", async () => {
    const { service, createdInvoices, facade, opsAlert } = buildHarness(
      baseBatch({ merchant: { id: "m1", taxId: "not-a-vkn", legalName: "X" } }),
    );
    await service.createInvoicesForSentBatch("batch1");

    expect(createdInvoices).toHaveLength(0);
    expect(facade.issue).not.toHaveBeenCalled();
    // [Fix round #6, I1] Retrying cannot fix bad master data, so this
    // branch still does not throw — but it must not be invisible either.
    expect(opsAlert.trySend).toHaveBeenCalledTimes(1);
    expect(opsAlert.trySend.mock.calls[0][2]).toEqual([
      expect.stringContaining("not-a-vkn"),
    ]);
  });

  it("skips (no-op) when the batch no longer exists", async () => {
    const { service, createdInvoices } = buildHarness(null);
    await expect(
      service.createInvoicesForSentBatch("gone"),
    ).resolves.toBeUndefined();
    expect(createdInvoices).toHaveLength(0);
  });

  it("routes EFATURA when the taxpayer lookup returns true, EARSIVFATURA when null/false", async () => {
    const known = buildHarness(baseBatch());
    (known.taxpayerLookup.checkIsEFaturaUser as jest.Mock).mockResolvedValue(
      true,
    );
    await known.service.createInvoicesForSentBatch("batch1");
    expect(known.createdInvoices[0]).toMatchObject({ docType: "EFATURA" });

    const unknown = buildHarness(baseBatch());
    await unknown.service.createInvoicesForSentBatch("batch1");
    expect(unknown.createdInvoices[0]).toMatchObject({
      docType: "EARSIVFATURA",
    });
  });

  it("issues via the facade and marks SENT on success", async () => {
    const { service, prisma, facade } = buildHarness(baseBatch());
    await service.createInvoicesForSentBatch("batch1");

    expect(facade.issue).toHaveBeenCalledTimes(1);
    expect(prisma.commissionInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SENT",
          nilveraDocId: "doc1",
        }),
      }),
    );
  });

  it("[Fix round #6, I1] leaves the invoice DRAFT and RETHROWS when issuance fails, so the outbox retries it instead of marking the event DONE", async () => {
    const { service, prisma, facade, rows } = buildHarness(baseBatch());
    (facade.issue as jest.Mock).mockRejectedValue(new Error("network down"));

    // This assertion used to read `.resolves.toBeUndefined()`. Swallowing
    // the error let SettlementSentInvoiceHandler return normally, so
    // dispatchOne reached markDone and the outbox's retry/backoff/DEAD
    // machinery never engaged for a commission invoice — a provider
    // outage during a payout window left a day of real tax documents
    // undrafted with no retry, no queue and no alert.
    await expect(service.createInvoicesForSentBatch("batch1")).rejects.toThrow(
      "network down",
    );
    expect(prisma.commissionInvoice.update).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ status: "DRAFT" });
  });

  it("[Fix round #6, C2] a redelivery of the same event never drafts a second invoice and never issues a second e-document", async () => {
    const { service, createdInvoices, facade } = buildHarness(
      baseBatch({
        membershipOffsetCents: 6000,
        membershipOffsetVatCents: 1000,
      }),
    );

    await service.createInvoicesForSentBatch("batch1");
    // The outbox is at-least-once: a handler whose markDone write fails is
    // deliberately left PROCESSING for the stale-lease reclaim, which
    // dispatches it exactly once more. That second dispatch used to run an
    // unconditional `create`, minting a new row with a NEW id — and the id
    // IS the provider's idempotency key, so the provider's own dedupe
    // could not see it: a second legally-issued e-fatura for one batch.
    await service.createInvoicesForSentBatch("batch1");

    expect(createdInvoices).toHaveLength(2); // BAG_FEE + MEMBERSHIP, once each
    expect(facade.issue).toHaveBeenCalledTimes(2);
  });

  it("[Fix round #6, C2] retries a still-DRAFT invoice with the SAME invoice id — the one value the provider contract dedupes on", async () => {
    const { service, facade, createdInvoices, rows } =
      buildHarness(baseBatch());
    (facade.issue as jest.Mock).mockRejectedValueOnce(new Error("nilvera 503"));

    await expect(service.createInvoicesForSentBatch("batch1")).rejects.toThrow(
      "nilvera 503",
    );
    await service.createInvoicesForSentBatch("batch1");

    expect(createdInvoices).toHaveLength(1);
    const [firstCall, secondCall] = (facade.issue as jest.Mock).mock.calls;
    expect(secondCall[0].invoiceId).toBe(firstCall[0].invoiceId);
    expect(rows[0]).toMatchObject({ status: "SENT", nilveraDocId: "doc1" });
  });

  it("[Fix round #6, C2] adopts the row a concurrent dispatch created (P2002) rather than drafting a second one", async () => {
    const { service, prisma, facade, rows } = buildHarness(baseBatch());
    const conflict = Object.assign(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["batchId", "type"] },
      }),
    );
    const raced = {
      id: "inv-raced",
      batchId: "batch1",
      type: "BAG_FEE",
      status: "DRAFT",
      nilveraDocId: null,
    };
    (prisma.commissionInvoice.create as jest.Mock).mockImplementationOnce(
      () => {
        rows.push(raced);
        return Promise.reject(conflict);
      },
    );

    await service.createInvoicesForSentBatch("batch1");

    expect(rows.filter((r) => r.type === "BAG_FEE")).toHaveLength(1);
    expect((facade.issue as jest.Mock).mock.calls[0][0].invoiceId).toBe(
      "inv-raced",
    );
  });

  it("[Fix round #6, C2] an issued-but-unrecorded invoice is reported as ISSUED (not as 'issuance failed') and rethrown for the outbox to retry", async () => {
    const { service, prisma } = buildHarness(baseBatch());
    (prisma.commissionInvoice.update as jest.Mock).mockRejectedValueOnce(
      new Error("db blip"),
    );
    const logged: string[] = [];
    jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });

    // The update used to sit INSIDE the issue() try-block, so this exact
    // case — a real e-document exists at the provider, only the local row
    // failed to record it — was logged as "drafted but issuance failed —
    // left DRAFT", the opposite of the truth, on the one branch that
    // carries a tax consequence.
    await expect(service.createInvoicesForSentBatch("batch1")).rejects.toThrow(
      "db blip",
    );
    expect(logged.some((m) => m.includes("WAS ISSUED at the provider"))).toBe(
      true,
    );
    expect(logged.some((m) => m.includes("issuance FAILED"))).toBe(false);
    jest.restoreAllMocks();
  });
});
