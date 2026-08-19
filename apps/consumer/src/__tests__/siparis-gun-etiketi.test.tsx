import { screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

let mockSearchParams: Record<string, string> = { id: "resv-1" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

import { client } from "../lib/api-client";
import { ekraniCiz } from "../test-utils/ekran";
import { renderWithPanelProviders } from "../test-utils/panel-render";
import OrderDetailScreen from "../app/order/[id]";
import OdemeEkrani from "../app/payment/[id]";
import type { ReservationItem } from "../lib/api-types";
import "../i18n";

const mockListMine = client.reservations.listMine as jest.Mock;
const mockStore = client.discovery.store as jest.Mock;

/** 18:30–21:00 İstanbul on 19 August. */
const PICKUP_START = "2026-08-19T15:30:00.000Z";
const PICKUP_END = "2026-08-19T18:00:00.000Z";

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
    status: "CONFIRMED",
    cancelDeadlineAt: "2026-08-19T16:00:00.000Z",
    pickupStartAt: PICKUP_START,
    pickupEndAt: PICKUP_END,
    redeemedAt: null,
    redeemedByMerchantUserId: null,
    pickupReminderSentAt: null,
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

async function siparisiCiz(simdi: Date, res = reservation()) {
  mockSearchParams = { id: res.id };
  mockListMine.mockResolvedValue({ items: [res], total: 1, page: 1, pageSize: 50 });
  mockStore.mockResolvedValue({
    store: { id: res.storeId, name: "Moda Fırın", district: "Kadıköy", coverImageUrl: null },
    todaysOffers: [],
    rating: { average: 0, count: 0 },
  });
  return renderWithPanelProviders(<OrderDetailScreen />, { sabitZaman: simdi });
}

/**
 * [#12] `orders.aliniyor` asserted "BUGÜN" unconditionally. Nothing in the
 * backend ever writes NO_SHOW and EXPIRED is only reachable from
 * PENDING_PAYMENT, so a reservation the user never collected stays
 * CONFIRMED forever — and kept telling them to walk to a shop today for a
 * window that closed days ago. The same string is wrong on purchase too:
 * discovery lists an offer published today for tomorrow's window.
 */
describe("Sipariş — 'BUGÜN' is only said on the day (#12)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("says BUGÜN when the pickup window really is today", async () => {
    await siparisiCiz(new Date("2026-08-19T15:00:00.000Z")); // 18:00 İstanbul

    await waitFor(() =>
      expect(screen.getByText("BUGÜN 18:30–21:00 arası al")).toBeTruthy(),
    );
  });

  it("names the day instead of claiming today for an uncollected order", async () => {
    await siparisiCiz(new Date("2026-08-22T15:00:00.000Z")); // three days later

    await waitFor(() =>
      expect(screen.getByText("19 AĞU 18:30–21:00 arası al")).toBeTruthy(),
    );
    expect(screen.queryByText(/BUGÜN/)).toBeNull();
  });

  it("names the day for a window that has not arrived yet", async () => {
    await siparisiCiz(
      new Date("2026-08-18T15:00:00.000Z"), // the evening before
      reservation({ cancelDeadlineAt: "2026-08-19T16:00:00.000Z" }),
    );

    await waitFor(() =>
      expect(screen.getByText("19 AĞU 18:30–21:00 arası al")).toBeTruthy(),
    );
  });

  /**
   * "Today" is İstanbul's today, not the device's or UTC's: at 00:30
   * İstanbul on the 20th, a window that ran 18:30–21:00 on the 19th is
   * yesterday's — even though both instants are still 19 August in UTC.
   */
  it("crosses the day at İstanbul midnight, not UTC midnight", async () => {
    await siparisiCiz(new Date("2026-08-19T21:30:00.000Z")); // 00:30 on the 20th

    await waitFor(() =>
      expect(screen.getByText("19 AĞU 18:30–21:00 arası al")).toBeTruthy(),
    );
  });
});

describe("Satın alma onayı — the ticket says the same thing (#12)", () => {
  beforeEach(() => jest.clearAllMocks());

  async function onayiCiz(simdi: Date) {
    mockSearchParams = { id: "resv-1", redirectUrl: "https://saglayici.example/x" };
    mockListMine.mockResolvedValue({
      items: [reservation()],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    mockStore.mockResolvedValue({
      store: { id: "store-1", name: "Moda Fırın", district: "Kadıköy", coverImageUrl: null },
      todaysOffers: [],
      rating: { average: 0, count: 0 },
    });
    return ekraniCiz(<OdemeEkrani />, { sabitZaman: simdi });
  }

  it("says BUGÜN on the ticket when the window is today", async () => {
    await onayiCiz(new Date("2026-08-19T15:00:00.000Z"));

    await waitFor(() =>
      expect(screen.getByText("BUGÜN 18:30–21:00 arası al")).toBeTruthy(),
    );
  });

  it("names the day on the ticket when the bag is for another day", async () => {
    await onayiCiz(new Date("2026-08-18T15:00:00.000Z"));

    await waitFor(() =>
      expect(screen.getByText("19 AĞU 18:30–21:00 arası al")).toBeTruthy(),
    );
    expect(screen.queryByText(/BUGÜN/)).toBeNull();
  });
});
