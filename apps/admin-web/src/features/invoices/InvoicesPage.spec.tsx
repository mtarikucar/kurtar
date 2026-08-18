import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KurtarApiError } from "@kurtar/api-client";
import "../../i18n";
import { InvoicesPage } from "./InvoicesPage";
import type { AdminInvoiceListItem } from "../../api/admin-types";

const draftInvoice: AdminInvoiceListItem = {
  id: "inv-draft",
  merchantId: "m1",
  merchantTradeName: "Ada Fırın",
  batchId: "b1",
  type: "BAG_FEE",
  docType: "EARSIVFATURA",
  status: "DRAFT",
  nilveraDocId: null,
  issuedAt: null,
  netAmountCents: 5000,
  vatCents: 1000,
  totalAmountCents: 6000,
  createdAt: "2026-08-03T00:00:00.000Z",
};

const listMock = vi.fn();
const reissueMock = vi.fn();

vi.mock("../../api/client", () => ({
  client: {
    admin: {
      invoices: {
        list: (...args: unknown[]) =>
          (listMock as unknown as (...a: unknown[]) => unknown)(...args),
        reissue: (...args: unknown[]) =>
          (reissueMock as unknown as (...a: unknown[]) => unknown)(...args),
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
      <MemoryRouter>
        <InvoicesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * [M16 fix] A commission e-invoice that fails issuance stays DRAFT with a
 * real tax obligation behind it, and before this screen nothing in the
 * product showed one or could act on it — the only signal was an ops
 * email, and the only recovery was a retry ladder already exhausted.
 */
describe("InvoicesPage — the stuck-invoice queue (M16)", () => {
  beforeEach(() => {
    listMock.mockReset();
    reissueMock.mockReset();
  });

  it("opens on the DRAFT queue, not on everything", async () => {
    listMock.mockResolvedValue({
      items: [draftInvoice],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    renderPage();

    expect(await screen.findByText("Ada Fırın")).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith({
      status: "DRAFT",
      page: 1,
      pageSize: 20,
    });
    // The row pill uses the compact vocabulary, not the filter's hint text.
    expect(screen.getByText("Taslak")).toBeInTheDocument();
    expect(screen.getByText("₺60,00")).toBeInTheDocument();
  });

  it("re-issues one invoice after a confirmation, and reports the provider document it got back", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({
      items: [draftInvoice],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    reissueMock.mockResolvedValue({
      id: "inv-draft",
      status: "SENT",
      nilveraDocId: "EARSIV-2026-77",
      issuedAt: "2026-08-06T00:00:00.000Z",
    });
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Yeniden kes" }),
    );
    // The dialog must explain why this cannot double-issue an e-fatura.
    expect(
      screen.getByText(/ikinci bir e-fatura oluşmaz/i),
    ).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Yeniden kes",
      }),
    );

    expect(reissueMock).toHaveBeenCalledWith("inv-draft");
    expect(await screen.findByText(/EARSIV-2026-77/)).toBeInTheDocument();
  });

  it("surfaces a provider refusal in its own words, and leaves the row alone", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({
      items: [draftInvoice],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    reissueMock.mockRejectedValue(
      new KurtarApiError({
        statusCode: 503,
        errorCode: "COMMISSION_INVOICE_ISSUE_FAILED",
        message: "The e-document provider refused the invoice.",
        isBackendErrorCode: true,
      }),
    );
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Yeniden kes" }),
    );
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Yeniden kes",
      }),
    );

    expect(
      await screen.findByText(/E-belge sağlayıcısı faturayı kabul etmedi/i),
    ).toBeInTheDocument();
  });

  it("offers no re-issue action for an invoice that is already issued", async () => {
    listMock.mockResolvedValue({
      items: [
        {
          ...draftInvoice,
          id: "inv-sent",
          status: "SENT",
          nilveraDocId: "EARSIV-2026-01",
          issuedAt: "2026-08-04T00:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    renderPage();

    expect(await screen.findByText("EARSIV-2026-01")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Yeniden kes" }),
    ).not.toBeInTheDocument();
  });

  it("says plainly when nothing is stuck, instead of a bare empty table", async () => {
    listMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    renderPage();

    expect(
      await screen.findByText(/Taslakta bekleyen fatura yok/),
    ).toBeInTheDocument();
  });
});
