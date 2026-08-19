import { fireEvent, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
}));

import { client } from "../lib/api-client";
import { renderWithPanelProviders } from "../test-utils/panel-render";
import OrdersScreen from "../app/(tabs)/orders";
import type { ReservationItem } from "../lib/api-types";
import "../i18n";

const mockListMine = client.reservations.listMine as jest.Mock;
const mockStore = client.discovery.store as jest.Mock;

function reservation(overrides: Partial<ReservationItem>): ReservationItem {
  return {
    id: "resv-1",
    code: "A8213",
    userId: "user-1",
    offerId: "offer-1",
    storeId: "store-1",
    qty: 1,
    unitPriceCents: 6900,
    totalCents: 6900,
    status: "CONFIRMED",
    cancelDeadlineAt: "2026-08-19T16:00:00.000Z",
    pickupStartAt: "2026-08-19T18:30:00.000Z",
    pickupEndAt: "2026-08-19T21:00:00.000Z",
    redeemedAt: null,
    redeemedByMerchantUserId: null,
    pickupReminderSentAt: null,
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("OrdersScreen — sectioned AKTİF / GEÇMİŞ (spec §4.6)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.mockResolvedValue({
      store: { id: "store-1", name: "Moda Fırın", district: "Moda", coverImageUrl: null },
      todaysOffers: [],
      rating: { average: 0, count: 0 },
    });
  });

  it("renders both section headers when there is at least one order in each", async () => {
    mockListMine.mockResolvedValue({
      items: [
        reservation({ id: "r1", status: "CONFIRMED" }),
        reservation({ id: "r2", status: "REDEEMED", redeemedAt: "2026-08-18T18:34:11.000Z" }),
      ],
      total: 2,
      page: 1,
      pageSize: 50,
    });
    await renderWithPanelProviders(<OrdersScreen />);
    expect(await screen.findByText("AKTİF")).toBeTruthy();
    expect(screen.getByText("GEÇMİŞ")).toBeTruthy();
  });

  it("omits a section header entirely when that section is empty", async () => {
    mockListMine.mockResolvedValue({
      items: [reservation({ id: "r1", status: "CONFIRMED" })],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    await renderWithPanelProviders(<OrdersScreen />);
    await waitFor(() => expect(screen.getByText("AKTİF")).toBeTruthy());
    expect(screen.queryByText("GEÇMİŞ")).toBeNull();
  });

  it("shows the empty state when the caller has never ordered anything", async () => {
    mockListMine.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    await renderWithPanelProviders(<OrdersScreen />);
    expect(await screen.findByText("İlk paketini kurtardığında burada görünecek.")).toBeTruthy();
  });

  it("navigates to the ticket when a row is pressed", async () => {
    mockListMine.mockResolvedValue({
      items: [reservation({ id: "r1", status: "CONFIRMED" })],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    await renderWithPanelProviders(<OrdersScreen />);
    const row = await screen.findByText("Moda Fırın");
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/order/[id]",
      params: { id: "r1" },
    });
  });
});
