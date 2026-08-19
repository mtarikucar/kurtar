import { fireEvent, screen } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
}));

jest.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1", phone: "+905551110004", status: "ACTIVE", name: null },
    logout: jest.fn(),
  }),
}));

import { client } from "../lib/api-client";
import { renderWithPanelProviders } from "../test-utils/panel-render";
import ProfileScreen from "../app/(tabs)/profile";
import type { ReservationItem } from "../lib/api-types";
import "../i18n";

const mockImpact = client.impact.getMine as jest.Mock;
const mockListMine = client.reservations.listMine as jest.Mock;
const mockStore = client.discovery.store as jest.Mock;

const GORUNUR = { includeHiddenElements: true } as const;

function reservation(overrides: Partial<ReservationItem>): ReservationItem {
  return {
    id: "resv-1",
    code: "A8213",
    userId: "user-1",
    offerId: "offer-1",
    storeId: "store-3",
    qty: 1,
    unitPriceCents: 11900,
    totalCents: 11900,
    status: "REDEEMED",
    cancelDeadlineAt: "2026-08-01T16:00:00.000Z",
    pickupStartAt: "2026-08-01T18:30:00.000Z",
    pickupEndAt: "2026-08-01T21:00:00.000Z",
    redeemedAt: "2026-08-01T18:45:00.000Z",
    redeemedByMerchantUserId: null,
    pickupReminderSentAt: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("ProfileScreen — impact + SENİN SOKAĞIN (spec §4.7)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.mockImplementation((storeId: string) =>
      Promise.resolve({
        store: { id: storeId, name: storeId === "store-3" ? "Caferağa Kahve" : "Bir Dükkan", district: "Kadıköy", coverImageUrl: null },
        todaysOffers: [],
        rating: { average: 0, count: 0 },
      }),
    );
  });

  it("renders the three impact numbers exactly as the API returns them, never recomputed", async () => {
    mockImpact.mockResolvedValue({
      mealsSaved: 14,
      co2eGrams: 8400,
      moneySavedCents: 187000,
      count: 14,
    });
    mockListMine.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });

    await renderWithPanelProviders(<ProfileScreen />);

    expect(await screen.findByText("14 paket")).toBeTruthy();
    expect(screen.getByText("8,4 kg yemek")).toBeTruthy();
    expect(screen.getByText("1.870₺")).toBeTruthy();
  });

  it("builds the street from REDEEMED reservations only", async () => {
    mockImpact.mockResolvedValue({ mealsSaved: 1, co2eGrams: 500, moneySavedCents: 11900, count: 1 });
    mockListMine.mockResolvedValue({
      items: [
        reservation({ id: "r1", status: "REDEEMED" }),
        reservation({ id: "r2", status: "CANCELLED_BY_USER", redeemedAt: null }),
        reservation({ id: "r3", status: "PENDING_PAYMENT", redeemedAt: null }),
      ],
      total: 3,
      page: 1,
      pageSize: 50,
    });

    await renderWithPanelProviders(<ProfileScreen />);

    // The street groups by month — August 2026 for our one redeemed rescue.
    expect(await screen.findByText("Ağustos 2026", GORUNUR)).toBeTruthy();
    expect(await screen.findByText(/En çok gittiğin dükkân/)).toBeTruthy();
  });

  it("shows the street's empty state for a caller with no rescues yet", async () => {
    mockImpact.mockResolvedValue({ mealsSaved: 0, co2eGrams: 0, moneySavedCents: 0, count: 0 });
    mockListMine.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });

    await renderWithPanelProviders(<ProfileScreen />);
    expect(await screen.findByLabelText("Henüz bir kurtarman yok.", GORUNUR)).toBeTruthy();
  });

  it("navigates to notification preferences from the menu", async () => {
    mockImpact.mockResolvedValue({ mealsSaved: 0, co2eGrams: 0, moneySavedCents: 0, count: 0 });
    mockListMine.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });

    await renderWithPanelProviders(<ProfileScreen />);
    const row = await screen.findByLabelText("Bildirim tercihleri");
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith("/notification-preferences");
  });
});
