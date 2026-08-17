import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type KurtarClient } from "@kurtar/api-client";
import { PickupListSection } from "./PickupListSection";

const listForMerchant = vi.fn();
const redeem = vi.fn();

vi.mock("../api/client", () => ({
  client: {
    reservations: {
      listForMerchant: (...args: unknown[]) => listForMerchant(...args),
      redeem: (...args: unknown[]) => redeem(...args),
    },
  } as unknown as KurtarClient,
}));

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PickupListSection />
    </QueryClientProvider>,
  );
}

describe("PickupListSection — the real per-reservation pickup list, plus the manual fallback", () => {
  beforeEach(() => {
    listForMerchant.mockReset();
    redeem.mockReset();
  });

  it("renders today's reservations with code, customer first name, quantity, and status", async () => {
    listForMerchant.mockResolvedValue({
      items: [
        {
          id: "resv-1",
          storeId: "store-1",
          offerId: "offer-1",
          code: "K-7F3M",
          qty: 2,
          status: "CONFIRMED",
          pickupStartAt: "2026-08-15T16:00:00.000Z",
          pickupEndAt: "2026-08-15T18:00:00.000Z",
          redeemedAt: null,
          customerFirstName: "Elif",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderSection();

    expect(await screen.findByText("K-7F3M")).toBeInTheDocument();
    expect(screen.getByText("Elif")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Teslim et" }),
    ).toBeInTheDocument();
  });

  it("redeeming a row calls the real redeem endpoint with that reservation's id and refreshes the list", async () => {
    listForMerchant.mockResolvedValueOnce({
      items: [
        {
          id: "resv-1",
          storeId: "store-1",
          offerId: "offer-1",
          code: "K-7F3M",
          qty: 1,
          status: "CONFIRMED",
          pickupStartAt: "2026-08-15T16:00:00.000Z",
          pickupEndAt: "2026-08-15T18:00:00.000Z",
          redeemedAt: null,
          customerFirstName: "Elif",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    redeem.mockResolvedValue({
      reservationId: "resv-1",
      status: "REDEEMED",
      redeemedAt: "2026-08-15T16:05:00.000Z",
    });
    listForMerchant.mockResolvedValueOnce({
      items: [
        {
          id: "resv-1",
          storeId: "store-1",
          offerId: "offer-1",
          code: "K-7F3M",
          qty: 1,
          status: "REDEEMED",
          pickupStartAt: "2026-08-15T16:00:00.000Z",
          pickupEndAt: "2026-08-15T18:00:00.000Z",
          redeemedAt: "2026-08-15T16:05:00.000Z",
          customerFirstName: "Elif",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderSection();
    await userEvent.click(
      await screen.findByRole("button", { name: "Teslim et" }),
    );

    await waitFor(() => expect(redeem).toHaveBeenCalledWith("resv-1"));
    await waitFor(() => expect(listForMerchant).toHaveBeenCalledTimes(2));
  });

  it("shows an empty state, never a bare blank list, when nothing is reserved today", async () => {
    listForMerchant.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    renderSection();
    expect(
      await screen.findByText("Bugün için henüz rezervasyon yok."),
    ).toBeInTheDocument();
  });

  it("keeps the manual by-id fallback working independently of the list", async () => {
    listForMerchant.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    redeem.mockResolvedValue({
      reservationId: "resv-manual",
      status: "REDEEMED",
      redeemedAt: "2026-08-15T16:05:00.000Z",
    });

    renderSection();
    await screen.findByText("Bugün için henüz rezervasyon yok.");

    await userEvent.type(
      screen.getByLabelText("Rezervasyon kimliği"),
      "resv-manual",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Teslim edildi olarak işaretle" }),
    );

    await waitFor(() => expect(redeem).toHaveBeenCalledWith("resv-manual"));
    expect(
      await screen.findByText("Rezervasyon teslim edildi olarak işaretlendi."),
    ).toBeInTheDocument();
  });
});
