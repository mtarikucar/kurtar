import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../i18n";
import { MerchantsPage } from "./MerchantsPage";
import type {
  AdminMerchantListItem,
  MerchantSuspendResponse,
} from "../../api/admin-types";

const approvedMerchant: AdminMerchantListItem = {
  id: "merchant-1",
  legalName: "Ada Fırın Gıda Ltd.",
  tradeName: "Ada Fırın",
  taxId: "1234567890",
  verificationStatus: "APPROVED",
  verifiedAt: "2026-01-15T00:00:00.000Z",
  createdAt: "2025-12-01T00:00:00.000Z",
};

const suspendResponse: MerchantSuspendResponse = {
  merchantId: "merchant-1",
  status: "SUSPENDED",
  offersCancelled: 7,
};

const listMock = vi.fn(async ({ status }: { status?: string }) => {
  if (status === "APPROVED") {
    return { items: [approvedMerchant], total: 1, page: 1, pageSize: 200 };
  }
  return { items: [approvedMerchant], total: 1, page: 1, pageSize: 20 };
});
const suspendMock = vi.fn(async () => suspendResponse);

vi.mock("../../api/client", () => ({
  client: {
    admin: {
      merchants: {
        list: (...args: Parameters<typeof listMock>) => listMock(...args),
        approve: vi.fn(),
        reject: vi.fn(),
        suspend: (...args: Parameters<typeof suspendMock>) =>
          suspendMock(...args),
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
      <MemoryRouter initialEntries={["/merchants"]}>
        <MerchantsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MerchantsPage — suspend flow", () => {
  it("shows the blast-radius warning before the click, then the REAL offer count from the API after", async () => {
    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByText("Ada Fırın");
    expect(row).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Askıya al" }));

    // Before the click is confirmed: the dialog states the consequence in
    // words, no invented number (no per-merchant offer count exists in
    // the API — see MerchantActionDialog.tsx's doc comment).
    expect(
      screen.getByText(/tüm aktif teklifleri iptal edilecek/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Askıya al, teklifleri iptal et/i }),
    );

    // After the action: the REAL count from MerchantSuspendResponseDto.
    await waitFor(() => {
      expect(
        screen.getByText(/7 aktif teklif iptal edildi/),
      ).toBeInTheDocument();
    });
    expect(suspendMock).toHaveBeenCalledWith("merchant-1", { note: undefined });
  });

  it("lists the current filter options including the synthetic PENDING filter", async () => {
    renderPage();
    await screen.findByText("Ada Fırın");
    const select = screen.getByLabelText("Durum") as HTMLSelectElement;
    const options = within(select)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("PENDING");
    expect(options).toContain("ALL");
  });
});
