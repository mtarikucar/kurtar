import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../i18n";
import { ComplaintDetailPage } from "./ComplaintDetailPage";
import type { ComplaintDetail } from "../../api/admin-types";

const baseComplaint: ComplaintDetail = {
  id: "c1",
  userId: "u1",
  merchantId: "m1",
  reservationId: "resv1",
  category: "FOOD_QUALITY",
  description: "Paket bozulmuştu.",
  status: "RESOLVED",
  slaDeadlineAt: "2026-08-20T00:00:00.000Z",
  resolvedAt: "2026-08-15T00:00:00.000Z",
  slaWarningSentAt: null,
  refundedAt: null,
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  messages: [],
};

const getMock = vi.fn(async () => baseComplaint);
const refundMock = vi.fn();

vi.mock("../../api/client", () => ({
  client: {
    admin: {
      complaints: {
        get: (...args: Parameters<typeof getMock>) => getMock(...args),
        resolve: vi.fn(),
        escalate: vi.fn(),
        refund: (...args: Parameters<typeof refundMock>) =>
          refundMock(...args),
      },
    },
    complaints: {
      addMessage: vi.fn(),
    },
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/complaints/c1"]}>
        <Routes>
          <Route path="/complaints/:id" element={<ComplaintDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// [I3 fix] Regression coverage for the admin-initiated refund action —
// the only production entry point for refunding a REDEEMED reservation.
describe("ComplaintDetailPage — refund action", () => {
  it("shows the refund button when the complaint has a linked reservation and hasn't been refunded yet, and reports success with the real outcome", async () => {
    refundMock.mockResolvedValue({
      reservationId: "resv1",
      ok: true,
      refundRef: "mock-refund-1",
    });
    const user = userEvent.setup();
    renderPage();

    const refundButton = await screen.findByRole("button", {
      name: "Rezervasyonu iade et",
    });
    await user.click(refundButton);

    // Consequence stated in words before the click is confirmed.
    expect(
      screen.getByText(/rezervasyonun ödemesi tamamen iade edilecektir/),
    ).toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: "Rezervasyonu iade et" })[1],
    );

    await waitFor(() => {
      expect(
        screen.getByText("İade başlatıldı — ödeme sağlayıcıya gönderildi."),
      ).toBeInTheDocument();
    });
    expect(refundMock).toHaveBeenCalledWith("c1");
  });

  it("reports the REAL provider failure (not a generic success) when the backend returns ok:false — a 2xx response that didn't move money", async () => {
    refundMock.mockResolvedValue({
      reservationId: "resv1",
      ok: false,
      error: "provider down",
    });
    const user = userEvent.setup();
    renderPage();

    const refundButton = await screen.findByRole("button", {
      name: "Rezervasyonu iade et",
    });
    await user.click(refundButton);
    await user.click(
      screen.getAllByRole("button", { name: "Rezervasyonu iade et" })[1],
    );

    await waitFor(() => {
      expect(
        screen.getByText("İade başarısız oldu, para hareket etmedi: provider down"),
      ).toBeInTheDocument();
    });
  });

  it("does NOT show the refund button once the ticket already triggered one (refundedAt set)", async () => {
    getMock.mockResolvedValueOnce({
      ...baseComplaint,
      refundedAt: "2026-08-16T00:00:00.000Z",
    });
    renderPage();

    await screen.findByText("Paket bozulmuştu.");
    expect(
      screen.queryByRole("button", { name: "Rezervasyonu iade et" }),
    ).not.toBeInTheDocument();
  });

  it("does NOT show the refund button when the complaint has no linked reservation", async () => {
    getMock.mockResolvedValueOnce({ ...baseComplaint, reservationId: null });
    renderPage();

    await screen.findByText("Paket bozulmuştu.");
    expect(
      screen.queryByRole("button", { name: "Rezervasyonu iade et" }),
    ).not.toBeInTheDocument();
  });
});
