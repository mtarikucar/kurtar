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

function buildHarness(batch: FakeBatch | null) {
  const createdInvoices: Record<string, unknown>[] = [];
  let nextId = 1;
  const prisma = {
    settlementBatch: {
      findUnique: jest.fn().mockResolvedValue(batch),
    },
    commissionInvoice: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `inv${nextId++}`, ...data };
          createdInvoices.push(row);
          return Promise.resolve(row);
        }),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const facade = {
    issue: jest.fn().mockResolvedValue({ docId: "doc1", status: "issued" }),
  } as unknown as EDocumentFacadeService;

  const taxpayerLookup = {
    checkIsEFaturaUser: jest.fn().mockResolvedValue(null),
  } as unknown as TaxpayerLookupService;

  const service = new CommissionInvoiceService(
    prisma as never,
    facade,
    taxpayerLookup,
  );
  return { service, prisma, facade, taxpayerLookup, createdInvoices };
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

  it("skips entirely (no invoice, no provider call) for an invalid merchant taxId", async () => {
    const { service, createdInvoices, facade } = buildHarness(
      baseBatch({ merchant: { id: "m1", taxId: "not-a-vkn", legalName: "X" } }),
    );
    await service.createInvoicesForSentBatch("batch1");

    expect(createdInvoices).toHaveLength(0);
    expect(facade.issue).not.toHaveBeenCalled();
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

  it("leaves the invoice DRAFT (never throws) when issuance fails", async () => {
    const { service, prisma, facade } = buildHarness(baseBatch());
    (facade.issue as jest.Mock).mockRejectedValue(new Error("network down"));

    await expect(
      service.createInvoicesForSentBatch("batch1"),
    ).resolves.toBeUndefined();
    expect(prisma.commissionInvoice.update).not.toHaveBeenCalled();
  });
});
