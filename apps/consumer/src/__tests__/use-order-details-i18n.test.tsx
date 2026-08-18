import { waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

import { client } from "../lib/api-client";
import i18n from "../i18n";
import { renderHookWithProviders } from "../test-utils/render";
import { useOrderDetails } from "../hooks/use-order-details";
import type { ReservationItem, ReservationListResponse } from "../lib/api-types";

const mockListMine = client.reservations.listMine as jest.Mock;
const mockStore = client.discovery.store as jest.Mock;

function reservation(overrides: Partial<ReservationItem> = {}): ReservationItem {
  return {
    id: "resv-1",
    code: "AB12CD",
    userId: "user-1",
    offerId: "offer-1",
    storeId: "store-1",
    qty: 1,
    unitPriceCents: 4990,
    totalCents: 4990,
    status: "CONFIRMED",
    cancelDeadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    redeemedAt: null,
    redeemedByMerchantUserId: null,
    pickupReminderSentAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function listResponse(item: ReservationItem): ReservationListResponse {
  return { items: [item], total: 1, page: 1, pageSize: 20 };
}

// [M22 fix] The last-resort store-name fallback ("Mağaza", when neither a
// local purchase snapshot nor a live same-day store lookup can recover
// the real name) used to be a hardcoded Turkish literal.
describe("useOrderDetails — store name fallback is i18n-sourced (M22)", () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await i18n.changeLanguage("tr");
  });

  it("falls back to the Turkish 'Mağaza' label by default", async () => {
    mockListMine.mockResolvedValue(listResponse(reservation()));
    mockStore.mockRejectedValue(new Error("network down"));

    const { result } = await renderHookWithProviders(() =>
      useOrderDetails("resv-1"),
    );

    await waitFor(() => expect(result.current.data?.storeName).toBe("Mağaza"));
  });

  it("falls back to the English 'Store' label when the active language is English", async () => {
    await i18n.changeLanguage("en");
    mockListMine.mockResolvedValue(listResponse(reservation()));
    mockStore.mockRejectedValue(new Error("network down"));

    const { result } = await renderHookWithProviders(() =>
      useOrderDetails("resv-1"),
    );

    await waitFor(() => expect(result.current.data?.storeName).toBe("Store"));
  });
});
