import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

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
import KesifEkrani from "../app/(tabs)/index";
import "../i18n";

const GORUNUR = { includeHiddenElements: true } as const;

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

async function renderKesif(simdi = new Date("2026-08-19T16:00:00.000Z")) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ClockProvider sabitZaman={simdi}>
        <ThemeProvider fazZorla="gece">
          <KesifEkrani />
        </ThemeProvider>
      </ClockProvider>
    </QueryClientProvider>,
  );
}

describe("Keşif screen — loading / error / empty / list branches (spec §4.1 / §4.8)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMap.mockResolvedValue([]);
  });

  it("shows the closed-street loading caption before the first response lands", async () => {
    mockOffers.mockReturnValue(new Promise(() => undefined)); // never resolves
    await renderKesif();
    expect(screen.getByText("Kepenkler kalkıyor…")).toBeTruthy();
  });

  it("shows the error street with a retry that refetches", async () => {
    mockOffers.mockRejectedValue(new Error("network down"));
    await renderKesif();

    await waitFor(() => expect(screen.getByText("Bağlantı yok — tekrar dene")).toBeTruthy());

    mockOffers.mockResolvedValueOnce({ items: [offer()], total: 1, page: 1, pageSize: 50 });
    await fireEvent.press(screen.getByLabelText("Bağlantı yok — tekrar dene"));

    await waitFor(() => expect(mockOffers).toHaveBeenCalledTimes(2));
  });

  it("shows the night-empty street with a real countdown when nothing is open", async () => {
    mockOffers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    await renderKesif(new Date("2026-08-19T16:00:00.000Z")); // 19:00 Istanbul, gece forced

    await waitFor(() =>
      expect(screen.getByText("Bu civarda kepenkler indi.")).toBeTruthy(),
    );
    expect(screen.getByText(/sonra/)).toBeTruthy();
  });

  it("shows the filtered-empty street (not the night copy) when the fırın/pastane split matches nothing", async () => {
    // A fırın-named shop, BAKERY — the server-side category still matches
    // PASTANE's query (both chips narrow to BAKERY), so this exercises the
    // CLIENT-side split in lib/kesif.ts's `eslesiyorMu`, not the mock.
    mockOffers.mockResolvedValue({ items: [offer()], total: 1, page: 1, pageSize: 50 });
    await renderKesif();

    await waitFor(() => expect(screen.queryByText("Kepenkler kalkıyor…")).toBeNull());

    await fireEvent.press(screen.getByTestId("kesif-cip-PASTANE"));

    await waitFor(() =>
      expect(screen.getByText("Bu filtreyle açık kepenk yok.")).toBeTruthy(),
    );
    expect(screen.queryByText("Bu civarda kepenkler indi.")).toBeNull();
  });

  it("renders a district section header and the offer's shop sign once data arrives", async () => {
    mockOffers.mockResolvedValue({ items: [offer()], total: 1, page: 1, pageSize: 50 });
    await renderKesif();

    await waitFor(() => expect(screen.getByText("KADIKÖY")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("MODA FIRIN", GORUNUR)).toBeTruthy());
  });

  it("sinks a fully sold-out response into the KAÇIRDIKLARIN section, not the empty state", async () => {
    mockOffers.mockResolvedValue({
      items: [offer({ qtyLeft: 0 })],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    await renderKesif();

    await waitFor(() => expect(screen.getByText("KAÇIRDIKLARIN")).toBeTruthy());
    expect(screen.queryByText("Bu civarda kepenkler indi.")).toBeNull();
  });
});
