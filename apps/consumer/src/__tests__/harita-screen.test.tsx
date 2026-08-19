import { render, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
}));

import { QueryClientProvider } from "@tanstack/react-query";
import { client } from "../lib/api-client";
import { createTestQueryClient } from "../test-utils/render";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import HaritaEkrani from "../app/(tabs)/harita";
import "../i18n";

const mockOffers = client.discovery.offers as jest.Mock;
const mockMap = client.discovery.map as jest.Mock;

function offer(over: Record<string, unknown> = {}) {
  return {
    offerId: "kd-demo-offer-1",
    store: { id: "store-1", name: "Moda Fırın", district: "Kadıköy", distanceM: 400 },
    template: {
      title: "Fırından Sürpriz Paket",
      category: "BAKERY",
      dietFlags: [],
      priceCents: 6900,
      originalValueCentsMin: 15000,
      originalValueCentsMax: 22000,
    },
    pickupStartAt: "2026-08-19T15:30:00.000Z",
    pickupEndAt: "2026-08-19T18:00:00.000Z",
    qtyLeft: 5,
    coverImageUrl: null,
    ...over,
  };
}

async function renderHarita(simdi = new Date("2026-08-19T16:00:00.000Z")) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ClockProvider sabitZaman={simdi}>
        <ThemeProvider fazZorla="gece">
          <HaritaEkrani />
        </ThemeProvider>
      </ClockProvider>
    </QueryClientProvider>,
  );
}

describe("Harita screen — the bottom sheet's three nearest offers (spec §4.2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMap.mockResolvedValue([]);
  });

  it("lists the nearest OPEN offers, sorted by closing time, sold-out excluded", async () => {
    mockOffers.mockResolvedValue({
      items: [
        offer({ offerId: "closes-later", pickupEndAt: "2026-08-19T20:00:00.000Z" }),
        offer({
          offerId: "closes-soon",
          store: { id: "store-2", name: "Levent Fırın", district: "Beşiktaş", distanceM: 900 },
          pickupEndAt: "2026-08-19T16:20:00.000Z",
        }),
        offer({ offerId: "sold-out", qtyLeft: 0, store: { id: "store-3", name: "Kapalı", district: "Kadıköy", distanceM: 50 } }),
      ],
      total: 3,
      page: 1,
      pageSize: 50,
    });
    await renderHarita();

    await waitFor(() => expect(screen.getByText("LEVENT FIRIN")).toBeTruthy());
    expect(screen.getByText("MODA FIRIN")).toBeTruthy();
    expect(screen.queryByText("KAPALI")).toBeNull();
  });

  it("shows the honest empty message when nothing nearby is open", async () => {
    mockOffers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    await renderHarita();

    await waitFor(() =>
      expect(screen.getByText("Şu an yakında açık kepenk yok")).toBeTruthy(),
    );
  });
});
