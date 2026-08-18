import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../i18n";
import { SettlementDetailPage } from "./SettlementDetailPage";
import type { AdminSettlementDetail } from "../../api/admin-types";

const baseBatch: AdminSettlementDetail = {
  id: "b1",
  merchantId: "m1",
  periodStart: "2026-08-01T00:00:00.000Z",
  periodEnd: "2026-08-02T00:00:00.000Z",
  status: "SENT",
  grossCents: 100000,
  bagFeeCents: 5000,
  bagFeeVatCents: 1000,
  withholdingCents: 500,
  membershipOffsetCents: 0,
  membershipOffsetVatCents: 0,
  refundClawbackCents: 0,
  netPayoutCents: 93500,
  carriedShortfallCents: 0,
  carriedExternalDemandCents: 0,
  inheritedExternalDemandCents: 0,
  shortfallResolvedAt: null,
  payoutAttemptedAt: null,
  holdReason: null,
  dueAt: "2026-08-10T00:00:00.000Z",
  pspTransferRef: null,
  sentAt: "2026-08-03T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  carriedDemandSourceBatchId: null,
  settlementLines: [],
  commissionInvoices: [],
  merchant: {
    tradeName: "Ada Fırın",
    legalName: "Ada Fırın Ltd.",
    iban: "TR000000000000000000000000",
  },
};

const getMock = vi.fn(async () => baseBatch);

vi.mock("../../api/client", () => ({
  client: {
    admin: {
      settlements: {
        get: (...args: Parameters<typeof getMock>) => getMock(...args),
        approve: vi.fn(),
        hold: vi.fn(),
        retry: vi.fn(),
      },
    },
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/settlements/b1"]}>
        <Routes>
          <Route path="/settlements/:id" element={<SettlementDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// [M16 fix] commissionInvoices was already included in this response
// (SettlementsService.adminGet) but no admin-web screen ever rendered it
// — a DRAFT-forever invoice (production is hard-disabled — mock-e-
// document-provider.ts, nilvera.adapter.ts) was completely invisible.
describe("SettlementDetailPage — renders commission invoices (M16)", () => {
  it("shows an empty-state line when the batch has no invoices yet", async () => {
    getMock.mockResolvedValue(baseBatch);
    renderPage();

    expect(
      await screen.findByText("Bu döneme ait fatura kaydı yok."),
    ).toBeInTheDocument();
  });

  it("renders each invoice's type, status, and total", async () => {
    getMock.mockResolvedValue({
      ...baseBatch,
      commissionInvoices: [
        {
          id: "inv-1",
          merchantId: "m1",
          batchId: "b1",
          type: "BAG_FEE",
          docType: "EARSIVFATURA",
          nilveraDocId: null,
          ublXmlRef: null,
          status: "DRAFT",
          issuedAt: null,
          netAmountCents: 5000,
          vatCents: 1000,
          totalAmountCents: 6000,
          linesJson: null,
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
        },
      ],
    });
    renderPage();

    const invoicesSection = await screen.findByTestId("settlement-invoices");
    expect(
      within(invoicesSection).getByText("Paket komisyonu"),
    ).toBeInTheDocument();
    expect(within(invoicesSection).getByText("Taslak")).toBeInTheDocument();
    expect(within(invoicesSection).getByText("₺60,00")).toBeInTheDocument();
  });
});
