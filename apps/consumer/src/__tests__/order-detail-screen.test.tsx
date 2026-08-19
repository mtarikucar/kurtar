import { fireEvent, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: { id: string } = { id: "resv-1" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

import { client } from "../lib/api-client";
import { renderWithPanelProviders } from "../test-utils/panel-render";
import OrderDetailScreen from "../app/order/[id]";
import type { ReservationItem } from "../lib/api-types";
import "../i18n";

const mockListMine = client.reservations.listMine as jest.Mock;
const mockStore = client.discovery.store as jest.Mock;

function reservation(overrides: Partial<ReservationItem> = {}): ReservationItem {
  return {
    id: "resv-1",
    code: "A8213",
    userId: "user-1",
    offerId: "offer-1",
    storeId: "store-1",
    qty: 1,
    unitPriceCents: 6900,
    totalCents: 6900,
    status: "REDEEMED",
    cancelDeadlineAt: "2026-08-19T16:00:00.000Z",
    pickupStartAt: "2026-08-19T18:30:00.000Z",
    pickupEndAt: "2026-08-19T21:00:00.000Z",
    redeemedAt: "2026-08-19T18:34:11.000Z",
    redeemedByMerchantUserId: null,
    pickupReminderSentAt: null,
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

async function ciz(res: ReservationItem) {
  mockSearchParams = { id: res.id };
  mockListMine.mockResolvedValue({ items: [res], total: 1, page: 1, pageSize: 50 });
  mockStore.mockResolvedValue({
    store: { id: res.storeId, name: "Moda Fırın", district: "Moda", coverImageUrl: null },
    todaysOffers: [],
    rating: { average: 0, count: 0 },
  });
  return renderWithPanelProviders(<OrderDetailScreen />, {
    sabitZaman: new Date("2026-08-19T20:00:00.000Z"),
  });
}

describe("Order detail — the ticket (spec §4.6)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the redeemed ticket line: code · price · time", async () => {
    await ciz(reservation({ status: "REDEEMED", redeemedAt: "2026-08-19T18:34:11.000Z" }));
    await waitFor(() =>
      expect(screen.getByText("kod A8213 · 69₺ · 21:34:11")).toBeTruthy(),
    );
  });

  it("offers to rate a redeemed order", async () => {
    await ciz(reservation({ status: "REDEEMED" }));
    await waitFor(() => expect(screen.getByText("Değerlendir")).toBeTruthy());
    fireEvent.press(screen.getByText("Değerlendir"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/rate/[id]", params: { id: "resv-1" } });
  });

  it("offers KEPENGİ AÇ and cancel for a confirmed order still within its cancel window", async () => {
    await ciz(
      reservation({
        status: "CONFIRMED",
        cancelDeadlineAt: "2026-08-19T23:00:00.000Z",
        redeemedAt: null,
      }),
    );
    await waitFor(() => expect(screen.getByText("KEPENGİ AÇ")).toBeTruthy());
    expect(screen.getByText("İptal et")).toBeTruthy();

    fireEvent.press(screen.getByText("KEPENGİ AÇ"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/redeem/[id]", params: { id: "resv-1" } });
  });

  it("hides the cancel action once the cancel deadline has passed", async () => {
    await ciz(
      reservation({
        status: "CONFIRMED",
        cancelDeadlineAt: "2026-08-19T10:00:00.000Z",
        redeemedAt: null,
      }),
    );
    await waitFor(() => expect(screen.getByText("KEPENGİ AÇ")).toBeTruthy());
    expect(screen.queryByText("İptal et")).toBeNull();
  });

  it("shows a not-found state for an unknown reservation id", async () => {
    mockSearchParams = { id: "does-not-exist" };
    mockListMine.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    await renderWithPanelProviders(<OrderDetailScreen />);
    expect(await screen.findByText("Sipariş bulunamadı.")).toBeTruthy();
  });
});
